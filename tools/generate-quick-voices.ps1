$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = [Console]::OutputEncoding
Add-Type -AssemblyName System.Speech
$taskRoot = Split-Path $PSScriptRoot -Parent
$taskSoundRoot = Join-Path $taskRoot 'web-assets/sounds/quick'
[System.IO.Directory]::CreateDirectory($taskSoundRoot) | Out-Null
if (Test-Path -LiteralPath (Join-Path $taskSoundRoot 'sources.json')) { throw 'Quick voices now use imported soundboard audio. Refusing to overwrite with synthetic speech.' }
$taskCatalog = & (Join-Path $taskRoot '.runtime/node16/node.exe') -e "process.stdout.write(JSON.stringify(require('./server/dist/data/QuickChat').QUICK_PHRASES))"
$taskEntries = $taskCatalog | ConvertFrom-Json
$taskSynth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
    $taskSynth.SelectVoice('Microsoft Huihui Desktop')
    $taskSynth.Rate = 1
    $taskFormat = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(22050, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
    foreach ($taskEntry in $taskEntries) {
        $taskSynth.SetOutputToWaveFile((Join-Path $taskSoundRoot ($taskEntry.id + '.wav')), $taskFormat)
        $taskSynth.Speak([string]$taskEntry.text)
        $taskSynth.SetOutputToNull()
    }
} finally { $taskSynth.Dispose() }
Write-Output ('Generated ' + $taskEntries.Count + ' quick voice clips')
