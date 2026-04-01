using DevKit.Models;

namespace DevKit.Services.Scaffolding;

public interface IScaffoldingService
{
    ScaffoldResponse Scaffold(ProjectManifest manifest, string mode = "create");
    string[] GetSupportedFrameworks();
}