using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace DevKit.Services.ApiTest;

public interface IApiTestService
{
    Task<SwaggerSpec> LoadSwaggerAsync(string url);
    SwaggerSpec ParseSwagger(string jsonContent);
    Task<ApiTestResponse> SendRequestAsync(ApiTestRequest request);
}

// ===== MODELS =====

public class SwaggerSpec
{
    [JsonPropertyName("title")]
    public string Title { get; set; } = string.Empty;

    [JsonPropertyName("version")]
    public string Version { get; set; } = string.Empty;

    [JsonPropertyName("baseUrl")]
    public string BaseUrl { get; set; } = string.Empty;

    [JsonPropertyName("endpoints")]
    public List<EndpointInfo> Endpoints { get; set; } = [];
}

public class EndpointInfo
{
    [JsonPropertyName("path")]
    public string Path { get; set; } = string.Empty;

    [JsonPropertyName("method")]
    public string Method { get; set; } = "GET";

    [JsonPropertyName("summary")]
    public string Summary { get; set; } = string.Empty;

    [JsonPropertyName("operationId")]
    public string OperationId { get; set; } = string.Empty;

    [JsonPropertyName("tags")]
    public List<string> Tags { get; set; } = [];

    [JsonPropertyName("parameters")]
    public List<ParameterInfo> Parameters { get; set; } = [];

    [JsonPropertyName("requestBody")]
    public RequestBodyInfo? RequestBody { get; set; }

    [JsonPropertyName("responses")]
    public Dictionary<string, ResponseInfo> Responses { get; set; } = new();
}

public class ParameterInfo
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("in")]
    public string In { get; set; } = "query";

    [JsonPropertyName("required")]
    public bool Required { get; set; }

    [JsonPropertyName("type")]
    public string Type { get; set; } = "string";

    [JsonPropertyName("description")]
    public string Description { get; set; } = string.Empty;

    [JsonPropertyName("example")]
    public string? Example { get; set; }
}

public class RequestBodyInfo
{
    [JsonPropertyName("contentType")]
    public string ContentType { get; set; } = "application/json";

    [JsonPropertyName("schema")]
    public string Schema { get; set; } = string.Empty;

    [JsonPropertyName("example")]
    public string? Example { get; set; }

    [JsonPropertyName("required")]
    public bool Required { get; set; } = true;
}

public class ResponseInfo
{
    [JsonPropertyName("description")]
    public string Description { get; set; } = string.Empty;

    [JsonPropertyName("schema")]
    public string? Schema { get; set; }
}

public class ApiTestRequest
{
    [JsonPropertyName("url")]
    public string Url { get; set; } = string.Empty;

    [JsonPropertyName("method")]
    public string Method { get; set; } = "GET";

    [JsonPropertyName("headers")]
    public Dictionary<string, string> Headers { get; set; } = new();

    [JsonPropertyName("queryParams")]
    public Dictionary<string, string> QueryParams { get; set; } = new();

    [JsonPropertyName("body")]
    public string? Body { get; set; }

    [JsonPropertyName("contentType")]
    public string ContentType { get; set; } = "application/json";

    [JsonPropertyName("timeoutSeconds")]
    public int TimeoutSeconds { get; set; } = 30;
}

public class ApiTestResponse
{
    [JsonPropertyName("statusCode")]
    public int StatusCode { get; set; }

    [JsonPropertyName("statusText")]
    public string StatusText { get; set; } = string.Empty;

    [JsonPropertyName("headers")]
    public Dictionary<string, string> Headers { get; set; } = new();

    [JsonPropertyName("body")]
    public string Body { get; set; } = string.Empty;

    [JsonPropertyName("contentType")]
    public string ContentType { get; set; } = string.Empty;

    [JsonPropertyName("durationMs")]
    public long DurationMs { get; set; }

    [JsonPropertyName("success")]
    public bool Success { get; set; }

    [JsonPropertyName("sizeBytes")]
    public long SizeBytes { get; set; }
}

// ===== SERVICE =====

public class ApiTestService : IApiTestService
{
    private static readonly HttpClient SharedClient = new() { Timeout = TimeSpan.FromSeconds(60) };

    public async Task<SwaggerSpec> LoadSwaggerAsync(string url)
    {
        var response = await SharedClient.GetStringAsync(url);
        return ParseSwagger(response);
    }

    public SwaggerSpec ParseSwagger(string jsonContent)
    {
        using var doc = JsonDocument.Parse(jsonContent);
        var root = doc.RootElement;
        var spec = new SwaggerSpec();

        // Info
        if (root.TryGetProperty("info", out var info))
        {
            spec.Title = info.TryGetProperty("title", out var t) ? t.GetString() ?? "" : "";
            spec.Version = info.TryGetProperty("version", out var v) ? v.GetString() ?? "" : "";
        }

        // Base URL
        if (root.TryGetProperty("servers", out var servers) && servers.GetArrayLength() > 0)
        {
            spec.BaseUrl = servers[0].TryGetProperty("url", out var u) ? u.GetString() ?? "" : "";
        }
        else if (root.TryGetProperty("host", out var host))
        {
            var scheme = "https";
            if (root.TryGetProperty("schemes", out var schemes) && schemes.GetArrayLength() > 0)
                scheme = schemes[0].GetString() ?? "https";
            var basePath = root.TryGetProperty("basePath", out var bp) ? bp.GetString() ?? "" : "";
            spec.BaseUrl = $"{scheme}://{host.GetString()}{basePath}";
        }

        // Paths
        if (root.TryGetProperty("paths", out var paths))
        {
            foreach (var pathProp in paths.EnumerateObject())
            {
                var path = pathProp.Name;
                foreach (var methodProp in pathProp.Value.EnumerateObject())
                {
                    var method = methodProp.Name.ToUpperInvariant();
                    if (method is "PARAMETERS" or "SERVERS" or "$REF") continue;

                    var op = methodProp.Value;
                    var endpoint = new EndpointInfo
                    {
                        Path = path,
                        Method = method,
                        Summary = op.TryGetProperty("summary", out var s) ? s.GetString() ?? "" : "",
                        OperationId = op.TryGetProperty("operationId", out var oid) ? oid.GetString() ?? "" : "",
                    };

                    // Tags
                    if (op.TryGetProperty("tags", out var tags))
                        foreach (var tag in tags.EnumerateArray())
                            endpoint.Tags.Add(tag.GetString() ?? "");

                    // Parameters
                    if (op.TryGetProperty("parameters", out var parameters))
                    {
                        foreach (var param in parameters.EnumerateArray())
                        {
                            var p = new ParameterInfo
                            {
                                Name = param.TryGetProperty("name", out var n) ? n.GetString() ?? "" : "",
                                In = param.TryGetProperty("in", out var i) ? i.GetString() ?? "query" : "query",
                                Required = param.TryGetProperty("required", out var r) && r.GetBoolean(),
                                Description = param.TryGetProperty("description", out var d) ? d.GetString() ?? "" : "",
                            };

                            if (param.TryGetProperty("schema", out var paramSchema))
                                p.Type = paramSchema.TryGetProperty("type", out var pt) ? pt.GetString() ?? "string" : "string";
                            else if (param.TryGetProperty("type", out var directType))
                                p.Type = directType.GetString() ?? "string";

                            endpoint.Parameters.Add(p);
                        }
                    }

                    // Request body (OpenAPI 3.x)
                    if (op.TryGetProperty("requestBody", out var reqBody))
                    {
                        var body = new RequestBodyInfo
                        {
                            Required = reqBody.TryGetProperty("required", out var rbr) && rbr.GetBoolean(),
                        };

                        if (reqBody.TryGetProperty("content", out var content))
                        {
                            foreach (var ct in content.EnumerateObject())
                            {
                                body.ContentType = ct.Name;
                                if (ct.Value.TryGetProperty("schema", out var schema))
                                    body.Schema = schema.ToString();

                                if (ct.Value.TryGetProperty("example", out var ex))
                                    body.Example = ex.ToString();

                                break;
                            }
                        }

                        endpoint.RequestBody = body;
                    }

                    // Responses
                    if (op.TryGetProperty("responses", out var responses))
                    {
                        foreach (var resp in responses.EnumerateObject())
                        {
                            var ri = new ResponseInfo
                            {
                                Description = resp.Value.TryGetProperty("description", out var rd) ? rd.GetString() ?? "" : "",
                            };
                            if (resp.Value.TryGetProperty("content", out var rc))
                                ri.Schema = rc.ToString();

                            endpoint.Responses[resp.Name] = ri;
                        }
                    }

                    spec.Endpoints.Add(endpoint);
                }
            }
        }

        return spec;
    }

    public async Task<ApiTestResponse> SendRequestAsync(ApiTestRequest request)
    {
        var result = new ApiTestResponse();
        var sw = System.Diagnostics.Stopwatch.StartNew();

        try
        {
            // URL + query params
            var url = request.Url;
            if (request.QueryParams.Count > 0)
            {
                var qs = string.Join("&", request.QueryParams.Select(kv =>
                    $"{Uri.EscapeDataString(kv.Key)}={Uri.EscapeDataString(kv.Value)}"));
                url += (url.Contains('?') ? "&" : "?") + qs;
            }

            using var httpRequest = new HttpRequestMessage(new HttpMethod(request.Method), url);

            // Headers
            foreach (var header in request.Headers)
            {
                if (header.Key.Equals("Content-Type", StringComparison.OrdinalIgnoreCase)) continue;
                httpRequest.Headers.TryAddWithoutValidation(header.Key, header.Value);
            }

            // Body
            if (!string.IsNullOrEmpty(request.Body) && request.Method is not "GET" and not "DELETE")
            {
                httpRequest.Content = new StringContent(request.Body, Encoding.UTF8, request.ContentType);
            }

            // Timeout
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(request.TimeoutSeconds));

            using var client = new HttpClient();
            using var response = await client.SendAsync(httpRequest, cts.Token);

            sw.Stop();

            result.StatusCode = (int)response.StatusCode;
            result.StatusText = response.ReasonPhrase ?? "";
            result.Success = response.IsSuccessStatusCode;
            result.DurationMs = sw.ElapsedMilliseconds;
            result.ContentType = response.Content.Headers.ContentType?.MediaType ?? "";

            // Response headers
            foreach (var header in response.Headers)
                result.Headers[header.Key] = string.Join(", ", header.Value);
            foreach (var header in response.Content.Headers)
                result.Headers[header.Key] = string.Join(", ", header.Value);

            // Response body
            var bodyBytes = await response.Content.ReadAsByteArrayAsync();
            result.SizeBytes = bodyBytes.Length;

            var bodyStr = Encoding.UTF8.GetString(bodyBytes);

            // JSON ise formatla
            try
            {
                using var jsonDoc = JsonDocument.Parse(bodyStr);
                result.Body = JsonSerializer.Serialize(jsonDoc, new JsonSerializerOptions { WriteIndented = true });
            }
            catch
            {
                result.Body = bodyStr;
            }
        }
        catch (TaskCanceledException)
        {
            sw.Stop();
            result.StatusCode = 408;
            result.StatusText = "Request Timeout";
            result.Body = $"Request timed out after {request.TimeoutSeconds} seconds";
            result.DurationMs = sw.ElapsedMilliseconds;
        }
        catch (Exception ex)
        {
            sw.Stop();
            result.StatusCode = 0;
            result.StatusText = "Error";
            result.Body = ex.Message;
            result.DurationMs = sw.ElapsedMilliseconds;
        }

        return result;
    }
}