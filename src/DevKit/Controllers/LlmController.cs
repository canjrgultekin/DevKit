using DevKit.Configuration;
using DevKit.Services.Llm;
using Microsoft.AspNetCore.Mvc;

namespace DevKit.Controllers;

[ApiController]
[Route("api")]
public class LlmController : ControllerBase
{
    private readonly ILlmService _llm;
    private readonly ProfileManager _profiles;

    public LlmController(ILlmService llm, ProfileManager profiles)
    {
        _llm = llm;
        _profiles = profiles;
    }

    // ═══════════════════════════════════════════════
    // ASK — baska bir LLM'e prompt/baglam ilet, cevabi al
    // ═══════════════════════════════════════════════

    [HttpPost("llm/ask")]
    public async Task<IActionResult> Ask([FromBody] LlmAskRequest request, CancellationToken ct)
    {
        var (provider, error) = ResolveProvider(request);
        if (provider == null)
            return Ok(new { success = false, error });

        var messages = new List<LlmMessage>();
        if (request.Messages != null && request.Messages.Count > 0)
        {
            messages = request.Messages
                .Select(m => new LlmMessage { Role = string.IsNullOrWhiteSpace(m.Role) ? "user" : m.Role!, Content = m.Content ?? "" })
                .ToList();
        }
        else
        {
            if (string.IsNullOrWhiteSpace(request.Prompt))
                return Ok(new { success = false, error = "Ya 'prompt' ya da 'messages' gerekli." });

            if (!string.IsNullOrWhiteSpace(request.SystemPrompt))
                messages.Add(new LlmMessage { Role = "system", Content = request.SystemPrompt! });
            messages.Add(new LlmMessage { Role = "user", Content = request.Prompt! });
        }

        var result = await _llm.AskAsync(provider, new LlmChatParams
        {
            Model = request.Model,
            Messages = messages,
            Temperature = request.Temperature,
            MaxTokens = request.MaxTokens,
        }, ct);

        return Ok(new
        {
            success = result.Success,
            provider = provider.Name,
            model = result.Model,
            content = result.Content,
            usage = new { promptTokens = result.PromptTokens, completionTokens = result.CompletionTokens, totalTokens = result.TotalTokens },
            error = result.Error,
        });
    }

    // ═══════════════════════════════════════════════
    // CONNECTION / KEY TEST
    // ═══════════════════════════════════════════════

    [HttpPost("llm/provider/test")]
    public async Task<IActionResult> Test([FromBody] LlmAskRequest request, CancellationToken ct)
    {
        var (provider, error) = ResolveProvider(request);
        if (provider == null)
            return Ok(new { success = false, error });

        var result = await _llm.TestAsync(provider, ct);
        return Ok(new { success = result.Success, provider = provider.Name, modelCount = result.ModelCount, error = result.Error });
    }

    // ═══════════════════════════════════════════════
    // PROVIDER REGISTRY
    // ═══════════════════════════════════════════════

    [HttpPost("llm/provider/save")]
    public IActionResult SaveProvider([FromBody] LlmProviderSaveRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
            return Ok(new { success = false, error = "Name gerekli." });
        if (string.IsNullOrWhiteSpace(request.ApiKey))
            return Ok(new { success = false, error = "ApiKey gerekli." });

        var type = string.IsNullOrWhiteSpace(request.ProviderType) ? "openai" : request.ProviderType.ToLowerInvariant();
        if (type is not ("openai" or "openai-compatible"))
            return Ok(new { success = false, error = "ProviderType su an 'openai' veya 'openai-compatible' olmali." });

        var provider = new LlmProvider
        {
            Name = request.Name,
            ProviderType = type,
            ApiKey = request.ApiKey,
            BaseUrl = request.BaseUrl,
            DefaultModel = request.DefaultModel,
            Organization = request.Organization,
            Description = request.Description,
        };

        _profiles.SaveLlmProvider(request.Name, provider);
        return Ok(new { success = true, name = request.Name, message = $"LLM provider '{request.Name}' kaydedildi." });
    }

    [HttpGet("llm/provider/list")]
    public IActionResult ListProviders()
    {
        var list = _profiles.GetLlmProviders().Select(kv => new
        {
            key = kv.Key,
            name = kv.Value.Name,
            providerType = kv.Value.ProviderType,
            baseUrl = string.IsNullOrWhiteSpace(kv.Value.BaseUrl) ? "https://api.openai.com/v1" : kv.Value.BaseUrl,
            defaultModel = kv.Value.DefaultModel,
            organization = kv.Value.Organization,
            hasApiKey = !string.IsNullOrEmpty(kv.Value.ApiKey),
            description = kv.Value.Description,
        }).ToList();

        return Ok(new { success = true, count = list.Count, providers = list });
    }

    [HttpPost("llm/provider/remove")]
    public IActionResult RemoveProvider([FromBody] LlmProviderRemoveRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
            return Ok(new { success = false, error = "Name gerekli." });

        var removed = _profiles.DeleteLlmProvider(request.Name);
        return Ok(new { success = removed, error = removed ? null : $"LLM provider '{request.Name}' bulunamadi." });
    }

    // ═══════════════════════════════════════════════
    // INTERNAL
    // ═══════════════════════════════════════════════

    private (LlmProvider? provider, string? error) ResolveProvider(LlmAskRequest req)
    {
        if (!string.IsNullOrWhiteSpace(req.ProviderName))
        {
            var saved = _profiles.GetLlmProvider(req.ProviderName);
            return saved == null
                ? (null, $"Kayitli LLM provider bulunamadi: {req.ProviderName}")
                : (saved, null);
        }

        if (string.IsNullOrWhiteSpace(req.ApiKey))
            return (null, "Ya 'providerName' (kayitli) ya da inline 'apiKey' gerekli.");

        var inline = new LlmProvider
        {
            Name = "(inline)",
            ProviderType = string.IsNullOrWhiteSpace(req.ProviderType) ? "openai" : req.ProviderType.ToLowerInvariant(),
            ApiKey = req.ApiKey,
            BaseUrl = req.BaseUrl,
            DefaultModel = req.Model,
            Organization = req.Organization,
        };
        return (inline, null);
    }
}

// ═══ REQUEST MODELS ═══

public sealed class LlmAskMessageDto
{
    public string? Role { get; set; }
    public string? Content { get; set; }
}

public sealed class LlmAskRequest
{
    // Kayitli provider adi (verilirse inline alanlar yok sayilir)
    public string? ProviderName { get; set; }

    // Tek-prompt kullanim
    public string? Prompt { get; set; }
    public string? SystemPrompt { get; set; }

    // Tam kontrol (verilirse Prompt/SystemPrompt yok sayilir)
    public List<LlmAskMessageDto>? Messages { get; set; }

    public string? Model { get; set; }
    public double? Temperature { get; set; }
    public int? MaxTokens { get; set; }

    // Inline provider (ProviderName yoksa)
    public string? ProviderType { get; set; }
    public string? ApiKey { get; set; }
    public string? BaseUrl { get; set; }
    public string? Organization { get; set; }
}

public sealed class LlmProviderSaveRequest
{
    public string Name { get; set; } = string.Empty;
    public string? ProviderType { get; set; } = "openai";
    public string ApiKey { get; set; } = string.Empty;
    public string? BaseUrl { get; set; }
    public string? DefaultModel { get; set; }
    public string? Organization { get; set; }
    public string? Description { get; set; }
}

public sealed class LlmProviderRemoveRequest
{
    public string Name { get; set; } = string.Empty;
}
