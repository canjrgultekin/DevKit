using Microsoft.AspNetCore.Mvc;
using Confluent.Kafka;
using Confluent.Kafka.Admin;

namespace DevKit.Controllers;

[ApiController]
[Route("api/kafka")]
public class KafkaController : ControllerBase
{
    // ═══ LIST TOPICS ═══
    [HttpPost("topics")]
    public async Task<IActionResult> ListTopics([FromBody] KafkaConnectionRequest request)
    {
        try
        {
            using var adminClient = new AdminClientBuilder(new AdminClientConfig { BootstrapServers = request.BootstrapServers }).Build();
            var metadata = adminClient.GetMetadata(TimeSpan.FromSeconds(10));

            var topics = metadata.Topics.Select(t => new
            {
                name = t.Topic,
                partitions = t.Partitions.Count,
                error = t.Error.Code != ErrorCode.NoError ? t.Error.Reason : null,
            }).OrderBy(t => t.name).ToList();

            return Ok(new { success = true, count = topics.Count, brokers = metadata.Brokers.Count, topics });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }

    // ═══ CREATE TOPIC ═══
    [HttpPost("topics/create")]
    public async Task<IActionResult> CreateTopic([FromBody] KafkaTopicRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.TopicName))
            return Ok(new { success = false, error = "TopicName gerekli." });

        try
        {
            using var adminClient = new AdminClientBuilder(new AdminClientConfig { BootstrapServers = request.BootstrapServers }).Build();

            await adminClient.CreateTopicsAsync(new[]
            {
                new TopicSpecification
                {
                    Name = request.TopicName,
                    NumPartitions = request.Partitions > 0 ? request.Partitions : 3,
                    ReplicationFactor = (short)(request.ReplicationFactor > 0 ? request.ReplicationFactor : 1),
                }
            });

            return Ok(new { success = true, topic = request.TopicName, partitions = request.Partitions > 0 ? request.Partitions : 3, message = "Topic olusturuldu." });
        }
        catch (CreateTopicsException ex)
        {
            return Ok(new { success = false, error = ex.Results.First().Error.Reason, topic = request.TopicName });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }

    // ═══ DELETE TOPIC ═══
    [HttpPost("topics/delete")]
    public async Task<IActionResult> DeleteTopic([FromBody] KafkaTopicRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.TopicName))
            return Ok(new { success = false, error = "TopicName gerekli." });

        try
        {
            using var adminClient = new AdminClientBuilder(new AdminClientConfig { BootstrapServers = request.BootstrapServers }).Build();
            await adminClient.DeleteTopicsAsync(new[] { request.TopicName });

            return Ok(new { success = true, topic = request.TopicName, message = "Topic silindi." });
        }
        catch (DeleteTopicsException ex)
        {
            return Ok(new { success = false, error = ex.Results.First().Error.Reason });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }

    // ═══ DESCRIBE TOPIC ═══
    [HttpPost("topics/describe")]
    public IActionResult DescribeTopic([FromBody] KafkaTopicRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.TopicName))
            return Ok(new { success = false, error = "TopicName gerekli." });

        try
        {
            using var adminClient = new AdminClientBuilder(new AdminClientConfig { BootstrapServers = request.BootstrapServers }).Build();
            var metadata = adminClient.GetMetadata(request.TopicName, TimeSpan.FromSeconds(10));
            var topic = metadata.Topics.FirstOrDefault();

            if (topic == null)
                return Ok(new { success = false, error = $"Topic bulunamadi: {request.TopicName}" });

            var partitions = topic.Partitions.Select(p => new
            {
                id = p.PartitionId,
                leader = p.Leader,
                replicas = p.Replicas,
                inSyncReplicas = p.InSyncReplicas,
            });

            return Ok(new { success = true, topic = topic.Topic, partitionCount = topic.Partitions.Count, partitions });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }

    // ═══ PRODUCE MESSAGE ═══
    [HttpPost("produce")]
    public async Task<IActionResult> Produce([FromBody] KafkaProduceRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.TopicName) || string.IsNullOrWhiteSpace(request.Message))
            return Ok(new { success = false, error = "TopicName ve Message gerekli." });

        try
        {
            var config = new ProducerConfig { BootstrapServers = request.BootstrapServers };
            using var producer = new ProducerBuilder<string?, string>(config).Build();

            var msg = new Message<string?, string> { Key = request.Key, Value = request.Message };
            var result = await producer.ProduceAsync(request.TopicName, msg);

            return Ok(new
            {
                success = true,
                topic = result.Topic,
                partition = result.Partition.Value,
                offset = result.Offset.Value,
                key = request.Key,
                messageLength = request.Message.Length,
            });
        }
        catch (ProduceException<string?, string> ex)
        {
            return Ok(new { success = false, error = ex.Error.Reason });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }

    // ═══ PRODUCE BATCH ═══
    [HttpPost("produce/batch")]
    public async Task<IActionResult> ProduceBatch([FromBody] KafkaBatchProduceRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.TopicName) || request.Messages == null || request.Messages.Count == 0)
            return Ok(new { success = false, error = "TopicName ve Messages gerekli." });

        try
        {
            var config = new ProducerConfig { BootstrapServers = request.BootstrapServers };
            using var producer = new ProducerBuilder<string?, string>(config).Build();

            var results = new List<object>();
            foreach (var m in request.Messages)
            {
                var msg = new Message<string?, string> { Key = m.Key, Value = m.Value };
                var result = await producer.ProduceAsync(request.TopicName, msg);
                results.Add(new { partition = result.Partition.Value, offset = result.Offset.Value, key = m.Key });
            }

            producer.Flush(TimeSpan.FromSeconds(10));
            return Ok(new { success = true, topic = request.TopicName, messageCount = results.Count, results });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }

    // ═══ CONSUME MESSAGES ═══
    [HttpPost("consume")]
    public IActionResult Consume([FromBody] KafkaConsumeRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.TopicName))
            return Ok(new { success = false, error = "TopicName gerekli." });

        try
        {
            var config = new ConsumerConfig
            {
                BootstrapServers = request.BootstrapServers,
                GroupId = request.GroupId ?? $"devkit-consumer-{Guid.NewGuid():N}",
                AutoOffsetReset = request.FromBeginning ? AutoOffsetReset.Earliest : AutoOffsetReset.Latest,
                EnableAutoCommit = false,
            };

            using var consumer = new ConsumerBuilder<string?, string>(config).Build();
            consumer.Subscribe(request.TopicName);

            var maxMessages = request.MaxMessages > 0 ? request.MaxMessages : 10;
            var timeoutMs = request.TimeoutMs > 0 ? request.TimeoutMs : 5000;
            var messages = new List<object>();
            var deadline = DateTime.UtcNow.AddMilliseconds(timeoutMs);

            while (messages.Count < maxMessages && DateTime.UtcNow < deadline)
            {
                try
                {
                    var result = consumer.Consume(TimeSpan.FromMilliseconds(Math.Max(100, (deadline - DateTime.UtcNow).TotalMilliseconds)));
                    if (result == null) continue;

                    messages.Add(new
                    {
                        key = result.Message.Key,
                        value = result.Message.Value?.Length > 2000 ? result.Message.Value[..2000] + "..." : result.Message.Value,
                        partition = result.Partition.Value,
                        offset = result.Offset.Value,
                        timestamp = result.Message.Timestamp.UtcDateTime,
                    });
                }
                catch (ConsumeException) { break; }
            }

            consumer.Close();
            return Ok(new { success = true, topic = request.TopicName, count = messages.Count, messages });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }

    // ═══ LIST CONSUMER GROUPS ═══
    [HttpPost("groups")]
    public IActionResult ListGroups([FromBody] KafkaConnectionRequest request)
    {
        try
        {
            using var adminClient = new AdminClientBuilder(new AdminClientConfig { BootstrapServers = request.BootstrapServers }).Build();
            var groups = adminClient.ListGroups(TimeSpan.FromSeconds(10));

            var result = groups.Select(g => new { group = g.Group, state = g.State, protocol = g.Protocol, members = g.Members.Count });
            return Ok(new { success = true, count = groups.Count, groups = result });
        }
        catch (Exception ex)
        {
            return Ok(new { success = false, error = ex.Message });
        }
    }
}

// ═══ REQUEST MODELS ═══

public class KafkaConnectionRequest
{
    public string BootstrapServers { get; set; } = "localhost:9092";
}

public sealed class KafkaTopicRequest : KafkaConnectionRequest
{
    public string TopicName { get; set; } = string.Empty;
    public int Partitions { get; set; }
    public int ReplicationFactor { get; set; }
}

public sealed class KafkaProduceRequest : KafkaConnectionRequest
{
    public string TopicName { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string? Key { get; set; }
}

public sealed class KafkaBatchProduceRequest : KafkaConnectionRequest
{
    public string TopicName { get; set; } = string.Empty;
    public List<KafkaMessageItem> Messages { get; set; } = new();
}

public sealed class KafkaMessageItem
{
    public string? Key { get; set; }
    public string Value { get; set; } = string.Empty;
}

public sealed class KafkaConsumeRequest : KafkaConnectionRequest
{
    public string TopicName { get; set; } = string.Empty;
    public int MaxMessages { get; set; }
    public int TimeoutMs { get; set; }
    public bool FromBeginning { get; set; } = true;
    public string? GroupId { get; set; }
}