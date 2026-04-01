using System.Runtime.InteropServices;
using DevKit.Configuration;
using DevKit.Services.Git;
using Microsoft.AspNetCore.Mvc;

namespace DevKit.Controllers;

[ApiController]
[Route("api/[controller]")]
public class GitController : ControllerBase
{
    private readonly IGitService _gitService;
    private readonly ProfileManager _profileManager;

    public GitController(IGitService gitService, ProfileManager profileManager)
    {
        _gitService = gitService;
        _profileManager = profileManager;
    }

    private string ResolveWorkingDir(string? workingDir)
    {
        if (!string.IsNullOrWhiteSpace(workingDir))
            return workingDir;

        var profile = _profileManager.GetActiveProfile();
        return profile?.Workspace ?? throw new InvalidOperationException("No workspace configured.");
    }

    private static string ResolveGhPath()
    {
        var isWindows = RuntimeInformation.IsOSPlatform(OSPlatform.Windows);
        var exeName = isWindows ? "gh.exe" : "gh";

        // PATH'te varsa direkt kullan
        var pathDirs = Environment.GetEnvironmentVariable("PATH")?.Split(Path.PathSeparator) ?? [];
        foreach (var dir in pathDirs)
        {
            try
            {
                var exePath = Path.Combine(dir, exeName);
                if (System.IO.File.Exists(exePath)) return exePath;
            }
            catch { }
        }

        // Bilinen kurulum yolları
        if (isWindows)
        {
            string[] windowsPaths =
            [
                @"C:\Program Files\GitHub CLI\gh.exe",
                @"C:\Program Files (x86)\GitHub CLI\gh.exe",
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "GitHub CLI", "gh.exe"),
            ];
            foreach (var p in windowsPaths)
            {
                if (System.IO.File.Exists(p)) return p;
            }
        }
        else
        {
            // Mac (Homebrew) ve Linux yolları
            string[] unixPaths =
            [
                "/opt/homebrew/bin/gh",       // Mac Apple Silicon (Homebrew)
                "/usr/local/bin/gh",          // Mac Intel (Homebrew) / Linux
                "/usr/bin/gh",                // Linux (apt/dnf)
                "/snap/bin/gh",               // Linux (snap)
            ];
            foreach (var p in unixPaths)
            {
                if (System.IO.File.Exists(p)) return p;
            }
        }

        return "gh"; // fallback
    }

    // ===== GITHUB REPO CREATE =====

    [HttpPost("github-create")]
    public async Task<IActionResult> GitHubCreateRepo([FromBody] GitHubCreateRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.RepoName))
            return Ok(new { success = false, steps = new[] { new { step = "validation", success = false, output = "", error = "Repository name is required." } } });

        var dir = ResolveWorkingDir(request.WorkingDir);
        var ghPath = ResolveGhPath();
        var steps = new List<object>();

        // 1. gh CLI kontrol
        var ghCheck = await _gitService.RunRawCommandAsync(ghPath, "--version", dir);
        if (!ghCheck.Success)
        {
            steps.Add(new { step = "gh CLI check", success = false, output = "", error = $"GitHub CLI not found. Tried: {ghPath}. Install: winget install GitHub.cli" });
            return Ok(new { success = false, steps });
        }
        steps.Add(new { step = "gh CLI check", success = true, output = ghCheck.Output.Split('\n')[0], error = "" });

        // 2. gh auth kontrol
        var authCheck = await _gitService.RunRawCommandAsync(ghPath, "auth status", dir);
        if (!authCheck.Success)
        {
            steps.Add(new { step = "gh auth", success = false, output = "", error = "Not authenticated. Run 'gh auth login' in terminal." });
            return Ok(new { success = false, steps });
        }
        steps.Add(new { step = "gh auth", success = true, output = "Authenticated", error = "" });

        // 3. git init
        var gitDir = Path.Combine(dir, ".git");
        if (!Directory.Exists(gitDir))
        {
            var initResult = await _gitService.RunCommandAsync(dir, "init");
            steps.Add(new { step = "git init", success = initResult.Success, output = initResult.Output, error = initResult.Error });
            if (!initResult.Success) return Ok(new { success = false, steps });
        }
        else
        {
            steps.Add(new { step = "git init", success = true, output = "Already initialized", error = "" });
        }

        // 4. Mevcut origin varsa kaldır
        var remoteCheck = await _gitService.RunCommandAsync(dir, "remote get-url origin");
        if (remoteCheck.Success)
        {
            await _gitService.RunCommandAsync(dir, "remote remove origin");
            steps.Add(new { step = "remove old origin", success = true, output = "Cleared", error = "" });
        }

        // 5. Stage + Commit
        if (request.InitialCommit)
        {
            var addResult = await _gitService.StageAsync(dir, ".");
            steps.Add(new { step = "git add .", success = addResult.Success, output = addResult.Output, error = addResult.Error });

            var commitMsg = request.CommitMessage ?? "initial commit";
            var commitResult = await _gitService.CommitAsync(dir, commitMsg);
            steps.Add(new { step = "git commit", success = commitResult.Success, output = commitResult.Output, error = commitResult.Error });
        }

        // 6. gh repo create
        var visibility = request.Private ? "--private" : "--public";
        var description = !string.IsNullOrWhiteSpace(request.Description)
            ? $"--description \"{request.Description.Replace("\"", "\\\"")}\""
            : "";

        var createArgs = $"repo create {request.RepoName} {visibility} {description} --source=. --remote=origin";
        if (request.PushAfterCreate)
            createArgs += " --push";

        var createResult = await _gitService.RunRawCommandAsync(ghPath, createArgs, dir);
        steps.Add(new { step = $"gh repo create", success = createResult.Success, output = createResult.Output, error = createResult.Error });

        if (!createResult.Success && createResult.Error?.Contains("already exists") != true)
            return Ok(new { success = false, steps });

        // 7. Fallback push
        if (request.PushAfterCreate && !createResult.Success)
        {
            var branch = request.DefaultBranch ?? "main";
            await _gitService.RunCommandAsync(dir, $"branch -M {branch}");
            var pushResult = await _gitService.PushAsync(dir, "origin", branch, setUpstream: true);
            steps.Add(new { step = "git push", success = pushResult.Success, output = pushResult.Output, error = pushResult.Error });
        }

        var allSuccess = steps.All(s =>
        {
            var prop = s.GetType().GetProperty("success");
            return prop != null && (bool)(prop.GetValue(s) ?? false);
        });

        return Ok(new { success = allSuccess, steps, repoUrl = $"https://github.com/{request.RepoName}" });
    }

    // ===== REPO SETUP =====

    [HttpPost("init")]
    public async Task<IActionResult> Init([FromBody] GitRequest request)
    {
        var dir = ResolveWorkingDir(request.WorkingDir);
        return Ok(await _gitService.RunCommandAsync(dir, "init"));
    }

    [HttpPost("init-connect")]
    public async Task<IActionResult> InitAndConnect([FromBody] GitInitConnectRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.RemoteUrl))
            return BadRequest(new { error = "Remote URL is required." });

        var dir = ResolveWorkingDir(request.WorkingDir);
        var steps = new List<object>();

        var gitDir = Path.Combine(dir, ".git");
        if (!Directory.Exists(gitDir))
        {
            var initResult = await _gitService.RunCommandAsync(dir, "init");
            steps.Add(new { step = "git init", success = initResult.Success, output = initResult.Output, error = initResult.Error });
            if (!initResult.Success) return Ok(new { success = false, steps });
        }
        else
        {
            steps.Add(new { step = "git init", success = true, output = "Already initialized", error = "" });
        }

        var remoteCheck = await _gitService.RunCommandAsync(dir, "remote get-url origin");
        if (remoteCheck.Success)
        {
            var setUrl = await _gitService.RunCommandAsync(dir, $"remote set-url origin {request.RemoteUrl}");
            steps.Add(new { step = "git remote set-url", success = setUrl.Success, output = $"Updated to {request.RemoteUrl}", error = setUrl.Error });
        }
        else
        {
            var addRemote = await _gitService.RunCommandAsync(dir, $"remote add origin {request.RemoteUrl}");
            steps.Add(new { step = "git remote add", success = addRemote.Success, output = request.RemoteUrl, error = addRemote.Error });
            if (!addRemote.Success) return Ok(new { success = false, steps });
        }

        var branchResult = await _gitService.RunCommandAsync(dir, $"branch -M {request.DefaultBranch ?? "main"}");
        steps.Add(new { step = "git branch -M", success = branchResult.Success, output = request.DefaultBranch ?? "main", error = branchResult.Error });

        if (request.InitialCommit)
        {
            await _gitService.StageAsync(dir, ".");
            steps.Add(new { step = "git add .", success = true, output = "", error = "" });
            var commitResult = await _gitService.CommitAsync(dir, request.CommitMessage ?? "initial commit");
            steps.Add(new { step = "git commit", success = commitResult.Success, output = commitResult.Output, error = commitResult.Error });
        }

        if (request.PushAfterConnect)
        {
            var pushResult = await _gitService.PushAsync(dir, "origin", request.DefaultBranch ?? "main", setUpstream: true);
            steps.Add(new { step = "git push -u origin", success = pushResult.Success, output = pushResult.Output, error = pushResult.Error });
        }

        var allSuccess = steps.All(s =>
        {
            var prop = s.GetType().GetProperty("success");
            return prop != null && (bool)(prop.GetValue(s) ?? false);
        });

        return Ok(new { success = allSuccess, steps });
    }

    // ===== REMOTE =====

    [HttpPost("remotes")]
    public async Task<IActionResult> Remotes([FromBody] GitRequest request)
        => Ok(await _gitService.RunCommandAsync(ResolveWorkingDir(request.WorkingDir), "remote -v"));

    [HttpPost("remote-add")]
    public async Task<IActionResult> RemoteAdd([FromBody] GitRemoteRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name) || string.IsNullOrWhiteSpace(request.Url))
            return BadRequest(new { error = "Remote name and URL are required." });
        return Ok(await _gitService.RunCommandAsync(ResolveWorkingDir(request.WorkingDir), $"remote add {request.Name} {request.Url}"));
    }

    [HttpPost("remote-remove")]
    public async Task<IActionResult> RemoteRemove([FromBody] GitRemoteRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
            return BadRequest(new { error = "Remote name is required." });
        return Ok(await _gitService.RunCommandAsync(ResolveWorkingDir(request.WorkingDir), $"remote remove {request.Name}"));
    }

    // ===== BRANCH =====

    [HttpPost("status")]
    public async Task<IActionResult> Status([FromBody] GitRequest request)
        => Ok(await _gitService.GetStatusAsync(ResolveWorkingDir(request.WorkingDir)));

    [HttpPost("branches")]
    public async Task<IActionResult> Branches([FromBody] GitRequest request)
        => Ok(await _gitService.GetBranchesAsync(ResolveWorkingDir(request.WorkingDir)));

    [HttpPost("current-branch")]
    public async Task<IActionResult> CurrentBranch([FromBody] GitRequest request)
        => Ok(await _gitService.GetCurrentBranchAsync(ResolveWorkingDir(request.WorkingDir)));

    [HttpPost("log")]
    public async Task<IActionResult> Log([FromBody] GitLogRequest request)
        => Ok(await _gitService.GetLogAsync(ResolveWorkingDir(request.WorkingDir), request.Count > 0 ? request.Count : 20));

    [HttpPost("checkout")]
    public async Task<IActionResult> Checkout([FromBody] GitBranchRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Branch)) return BadRequest(new { error = "Branch name is required." });
        return Ok(await _gitService.CheckoutAsync(ResolveWorkingDir(request.WorkingDir), request.Branch));
    }

    [HttpPost("create-branch")]
    public async Task<IActionResult> CreateBranch([FromBody] GitCreateBranchRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Branch)) return BadRequest(new { error = "Branch name is required." });
        return Ok(await _gitService.CreateBranchAsync(ResolveWorkingDir(request.WorkingDir), request.Branch, request.Checkout));
    }

    [HttpPost("delete-branch")]
    public async Task<IActionResult> DeleteBranch([FromBody] GitDeleteBranchRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Branch)) return BadRequest(new { error = "Branch name is required." });
        return Ok(await _gitService.DeleteBranchAsync(ResolveWorkingDir(request.WorkingDir), request.Branch, request.Force));
    }

    [HttpPost("rename-branch")]
    public async Task<IActionResult> RenameBranch([FromBody] GitRenameBranchRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.OldName) || string.IsNullOrWhiteSpace(request.NewName))
            return BadRequest(new { error = "Old and new branch names are required." });
        return Ok(await _gitService.RunCommandAsync(ResolveWorkingDir(request.WorkingDir), $"branch -m {request.OldName} {request.NewName}"));
    }

    // ===== STAGE & COMMIT =====

    [HttpPost("stage")]
    public async Task<IActionResult> Stage([FromBody] GitStageRequest request)
        => Ok(await _gitService.StageAsync(ResolveWorkingDir(request.WorkingDir), request.Path ?? "."));

    [HttpPost("commit")]
    public async Task<IActionResult> Commit([FromBody] GitCommitRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Message)) return BadRequest(new { error = "Commit message is required." });
        var dir = ResolveWorkingDir(request.WorkingDir);
        if (request.StageAll) await _gitService.StageAsync(dir, ".");
        return Ok(await _gitService.CommitAsync(dir, request.Message));
    }

    // ===== PUSH / PULL / FETCH =====

    [HttpPost("push")]
    public async Task<IActionResult> Push([FromBody] GitPushRequest request)
        => Ok(await _gitService.PushAsync(ResolveWorkingDir(request.WorkingDir), request.Remote, request.Branch, request.SetUpstream));

    [HttpPost("pull")]
    public async Task<IActionResult> Pull([FromBody] GitPullRequest request)
        => Ok(await _gitService.PullAsync(ResolveWorkingDir(request.WorkingDir), request.Remote, request.Branch));

    [HttpPost("fetch")]
    public async Task<IActionResult> Fetch([FromBody] GitRequest request)
        => Ok(await _gitService.FetchAsync(ResolveWorkingDir(request.WorkingDir)));

    // ===== MERGE =====

    [HttpPost("merge")]
    public async Task<IActionResult> Merge([FromBody] GitMergeRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Branch)) return BadRequest(new { error = "Branch name is required." });
        return Ok(await _gitService.MergeAsync(ResolveWorkingDir(request.WorkingDir), request.Branch, request.NoFastForward));
    }

    [HttpPost("merge-abort")]
    public async Task<IActionResult> MergeAbort([FromBody] GitRequest request)
        => Ok(await _gitService.RunCommandAsync(ResolveWorkingDir(request.WorkingDir), "merge --abort"));

    // ===== STASH =====

    [HttpPost("stash")]
    public async Task<IActionResult> Stash([FromBody] GitStashRequest request)
        => Ok(await _gitService.StashAsync(ResolveWorkingDir(request.WorkingDir), request.Message));

    [HttpPost("stash-pop")]
    public async Task<IActionResult> StashPop([FromBody] GitRequest request)
        => Ok(await _gitService.StashPopAsync(ResolveWorkingDir(request.WorkingDir)));

    [HttpPost("stash-list")]
    public async Task<IActionResult> StashList([FromBody] GitRequest request)
        => Ok(await _gitService.RunCommandAsync(ResolveWorkingDir(request.WorkingDir), "stash list"));

    // ===== DIFF & RESET =====

    [HttpPost("diff")]
    public async Task<IActionResult> Diff([FromBody] GitDiffRequest request)
        => Ok(await _gitService.DiffAsync(ResolveWorkingDir(request.WorkingDir), request.Staged));

    [HttpPost("reset")]
    public async Task<IActionResult> Reset([FromBody] GitStageRequest request)
        => Ok(await _gitService.ResetAsync(ResolveWorkingDir(request.WorkingDir), request.Path));

    // ===== TAG =====

    [HttpPost("tags")]
    public async Task<IActionResult> Tags([FromBody] GitRequest request)
        => Ok(await _gitService.RunCommandAsync(ResolveWorkingDir(request.WorkingDir), "tag -l --sort=-creatordate"));

    [HttpPost("create-tag")]
    public async Task<IActionResult> CreateTag([FromBody] GitTagRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.TagName)) return BadRequest(new { error = "Tag name is required." });
        var args = string.IsNullOrWhiteSpace(request.Message) ? $"tag {request.TagName}" : $"tag -a {request.TagName} -m \"{request.Message.Replace("\"", "\\\"")}\"";
        return Ok(await _gitService.RunCommandAsync(ResolveWorkingDir(request.WorkingDir), args));
    }

    [HttpPost("push-tags")]
    public async Task<IActionResult> PushTags([FromBody] GitRequest request)
        => Ok(await _gitService.RunCommandAsync(ResolveWorkingDir(request.WorkingDir), "push --tags"));

    // ===== CUSTOM =====

    [HttpPost("command")]
    public async Task<IActionResult> RunCommand([FromBody] GitCommandRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Arguments)) return BadRequest(new { error = "Git arguments are required." });
        return Ok(await _gitService.RunCommandAsync(ResolveWorkingDir(request.WorkingDir), request.Arguments));
    }
}

// Request models
public class GitRequest { public string? WorkingDir { get; set; } }
public class GitBranchRequest : GitRequest { public string Branch { get; set; } = string.Empty; }
public class GitCreateBranchRequest : GitBranchRequest { public bool Checkout { get; set; } = true; }
public class GitDeleteBranchRequest : GitBranchRequest { public bool Force { get; set; } = false; }
public class GitRenameBranchRequest : GitRequest { public string OldName { get; set; } = string.Empty; public string NewName { get; set; } = string.Empty; }
public class GitLogRequest : GitRequest { public int Count { get; set; } = 20; }
public class GitStageRequest : GitRequest { public string? Path { get; set; } }
public class GitCommitRequest : GitRequest { public string Message { get; set; } = string.Empty; public bool StageAll { get; set; } = true; }
public class GitPushRequest : GitRequest { public string? Remote { get; set; } public string? Branch { get; set; } public bool SetUpstream { get; set; } }
public class GitPullRequest : GitRequest { public string? Remote { get; set; } public string? Branch { get; set; } }
public class GitMergeRequest : GitBranchRequest { public bool NoFastForward { get; set; } }
public class GitStashRequest : GitRequest { public string? Message { get; set; } }
public class GitDiffRequest : GitRequest { public bool Staged { get; set; } }
public class GitCommandRequest : GitRequest { public string Arguments { get; set; } = string.Empty; }
public class GitRemoteRequest : GitRequest { public string Name { get; set; } = string.Empty; public string Url { get; set; } = string.Empty; }
public class GitTagRequest : GitRequest { public string TagName { get; set; } = string.Empty; public string? Message { get; set; } }
public class GitInitConnectRequest : GitRequest
{
    public string RemoteUrl { get; set; } = string.Empty;
    public string? DefaultBranch { get; set; } = "main";
    public bool InitialCommit { get; set; } = true;
    public string? CommitMessage { get; set; } = "initial commit";
    public bool PushAfterConnect { get; set; } = true;
}
public class GitHubCreateRequest : GitRequest
{
    public string RepoName { get; set; } = string.Empty;
    public string? Description { get; set; }
    public bool Private { get; set; } = true;
    public string? DefaultBranch { get; set; } = "main";
    public bool InitialCommit { get; set; } = true;
    public string? CommitMessage { get; set; } = "initial commit";
    public bool PushAfterCreate { get; set; } = true;
}