$port = 8080
$localPath = "C:\Users\paras\.gemini\antigravity\scratch\shiva-scroll-animation"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")

# Stop existing listener if any on port 8080
try {
    $listener.Start()
    Write-Host "Server started successfully on http://localhost:$port/"
} catch {
    Write-Host "Error: Could not start listener. Port might be in use: $_"
    exit 1
}

$running = $true

# Register an action to stop listener when script exits/aborted
$cleanup = {
    if ($listener -and $listener.IsListening) {
        $listener.Stop()
        Write-Host "Server stopped."
    }
}

try {
    while ($running -and $listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        
        $urlPath = $request.Url.LocalPath
        # Clean URL path from potential backslashes or traversal
        $urlPath = $urlPath -replace "\\", "/"
        if ($urlPath -eq "/" -or $urlPath -eq "") {
            $urlPath = "/index.html"
        }
        
        # Security check: prevent directory traversal
        if ($urlPath.Contains("..")) {
            $response.StatusCode = 403
            $bytes = [System.Text.Encoding]::UTF8.GetBytes("403 Forbidden")
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
            $response.Close()
            continue
        }
        
        $filePath = [System.IO.Path]::Combine($localPath, $urlPath.TrimStart('/'))
        
        if (Test-Path $filePath -PathType Leaf) {
            $extension = [System.IO.Path]::GetExtension($filePath).ToLower()
            $contentType = switch ($extension) {
                ".html" { "text/html; charset=utf-8" }
                ".css"  { "text/css" }
                ".js"   { "application/javascript" }
                ".jpg"  { "image/jpeg" }
                ".jpeg" { "image/jpeg" }
                ".png"  { "image/png" }
                ".webp" { "image/webp" }
                default { "application/octet-stream" }
            }
            
            $response.ContentType = $contentType
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
            $bytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        }
        $response.Close()
    }
} catch {
    Write-Host "Server encountered an error: $_"
} finally {
    & $cleanup
}
