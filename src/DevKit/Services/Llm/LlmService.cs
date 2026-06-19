using System.Text;
using System.Text.Json;
using DevKit.Configuration;

namespace DevKit.Services.Llm;

public interface ILlmService
{
    Task<LlmAskResult> AskAsync(LlmProvider provider, LlmChatParams p, CancellationToken ct);
    Task<LlmTestResult> TestAsync(LlmProvider provider, CancellationToken ct);
}

public sealed class LlmMessage
{
    public string Role { get; set; } = "user";
    public string Content { get; set; } = "";
}

public sealed class LlmChatParams
{
    public string? Model { get; set; }
    public List<LlmMessage> Messages { get; set; } = new();
    public double? Temperature { get; set; }
    public int? MaxTokens { get; set; }
}

public sealed class LlmAskResult
{
    public bool Success { get; set; }
    public string? Content { get; set; }
    public string? Model { get; set; }
    public int? PromptTokens { get; set; }
    public int? CompletionTokens { get; set; }
    public int? TotalTokens { get; set; }
    public string? Error { get; set; }
}

public sealed class LlmTestResult
{
    public bool Success { get; set; }
    public int? ModelCount { get; set; }
    public string? Error { get; set; }
}

public sealed class LlmService : ILlmService
{
    private readonly IHttpClientFactory _httpFactory;

    public LlmService(IHttpClientFactory httpFactory) => _httpFactory = httpFactory;

    public async Task<LlmAskResult> AskAsync(LlmProvider provider, LlmChatParams p, CancellationToken ct)
    {
        try
        {
            var type = (provider.ProviderType ?? "openai").ToLowerInvariant();
            // Su an OpenAI ve OpenAI-uyumlu (Groq, OpenRouter, Azure OpenAI, Ollama ...) destekleniyor.
            // Provider-agnostik tasarlandi; ileride "anthropic"/"gemini" buraya eklenir.
            if (type is not ("openai" or "openai-compatible"))
                return new LlmAskResult { Success = false, Error = $"Desteklenmeyen providerType: {provider.ProviderType}. Su an 'openai' / 'openai-compatible' destekleniyor." };

            return await OpenAiChatAsync(provider, p, ct);
        }
        catch (OperationCanceledException)
        {
            return new LlmAskResult { Success = false, Error = "Istek iptal edildi veya timeout asildi." };
        }
        catch (Exception ex)
        {
            return new LlmAskResult { Success = false, Error = ex.Message };
        }
    }

    private async Task<LlmAskResult> OpenAiChatAsync(LlmProvider provider, LlmChatParams p, CancellationToken ct)
    {
        var baseUrl = (string.IsNullOrWhiteSpace(provider.BaseUrl) ? "https://api.openai.com/v1" : provider.BaseUrl).TrimEnd('/');
        var model = !string.IsNullOrWhiteSpace(p.Model) ? p.Model!
            : !string.IsNullOrWhiteSpace(provider.DefaultModel) ? provider.DefaultModel!
            : "gpt-5.5";

        var payload = new Dictionary<string, object?>
        {
            ["model"] = model,
            ["messages"] = p.Messages.Select(m => new { role = m.Role, content = m.Content }).ToList(),
        };
        if (p.Temperature.HasValue) payload["temperature"] = p.Temperature.Value;
        if (p.MaxTokens.HasValue) payload["max_tokens"] = p.MaxTokens.Value;

        var client = _httpFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(300);

        using var req = new HttpRequestMessage(HttpMethod.Post, $"{baseUrl}/chat/completions");
        req.Headers.TryAddWithoutValidation("Authorization", $"Bearer {provider.ApiKey}");
        if (!string.IsNullOrWhiteSpace(provider.Organization))
            req.Headers.TryAddWithoutValidation("OpenAI-Organization", provider.Organization);
        req.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

        using var resp = await client.SendAsync(req, ct);
        var body = await resp.Content.ReadAsStringAsync(ct);

        if (!resp.IsSuccessStatusCode)
        {
            var hint = (int)resp.StatusCode == 401
                ? " | NOT: 401 genelde gecersiz/yetkisiz key demektir; OpenAI admin key (sk-admin-...) completion'da CALISMAZ, completion-yetkili bir API key kullanin."
                : "";
            return new LlmAskResult { Success = false, Error = $"OpenAI API {(int)resp.StatusCode}: {Trim(body, 1500)}{hint}" };
        }

        using var doc = JsonDocument.Parse(body);
        var root = doc.RootElement;

        string? content = null;
        if (root.TryGetProperty("choices", out var choices) && choices.ValueKind == JsonValueKind.Array && choices.GetArrayLength() > 0)
        {
            var first = choices[0];
            if (first.TryGetProperty("message", out var msg) && msg.TryGetProperty("content", out var c))
                content = c.GetString();
        }

        int? pt = null, ctk = null, tt = null;
        if (root.TryGetProperty("usage", out var usage) && usage.ValueKind == JsonValueKind.Object)
        {
            if (usage.TryGetProperty("prompt_tokens", out var x) && x.TryGetInt32(out var xi)) pt = xi;
            if (usage.TryGetProperty("completion_tokens", out var y) && y.TryGetInt32(out var yi)) ctk = yi;
            if (usage.TryGetProperty("total_tokens", out var z) && z.TryGetInt32(out var zi)) tt = zi;
        }

        var usedModel = root.TryGetProperty("model", out var mm) ? mm.GetString() : model;

        return new LlmAskResult
        {
            Success = true,
            Content = content,
            Model = usedModel,
            PromptTokens = pt,
            CompletionTokens = ctk,
            TotalTokens = tt,
        };
    }

    public async Task<LlmTestResult> TestAsync(LlmProvider provider, CancellationToken ct)
    {
        try
        {
            var baseUrl = (string.IsNullOrWhiteSpace(provider.BaseUrl) ? "https://api.openai.com/v1" : provider.BaseUrl).TrimEnd('/');
            var client = _httpFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(30);

            using var req = new HttpRequestMessage(HttpMethod.Get, $"{baseUrl}/models");
            req.Headers.TryAddWithoutValidation("Authorization", $"Bearer {provider.ApiKey}");
            if (!string.IsNullOrWhiteSpace(provider.Organization))
                req.Headers.TryAddWithoutValidation("OpenAI-Organization", provider.Organization);

            using var resp = await client.SendAsync(req, ct);
            var body = await resp.Content.ReadAsStringAsync(ct);

            if (!resp.IsSuccessStatusCode)
            {
                var hint = (int)resp.StatusCode == 401
                    ? " | NOT: admin key (sk-admin-...) completion/model erisiminde calismaz, normal API key gerekir."
                    : "";
                return new LlmTestResult { Success = false, Error = $"{(int)resp.StatusCode}: {Trim(body, 800)}{hint}" };
            }

            int? count = null;
            using var doc = JsonDocument.Parse(body);
            if (doc.RootElement.TryGetProperty("data", out var data) && data.ValueKind == JsonValueKind.Array)
                count = data.GetArrayLength();

            return new LlmTestResult { Success = true, ModelCount = count };
        }
        catch (Exception ex)
        {
            return new LlmTestResult { Success = false, Error = ex.Message };
        }
    }

    private static string Trim(string s, int max) => string.IsNullOrEmpty(s) ? "" : (s.Length > max ? s[..max] : s);
}
