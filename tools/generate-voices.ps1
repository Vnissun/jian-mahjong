# Run on Windows with the installed Microsoft Huihui Desktop voice.
param([string[]]$Keys = @())
Add-Type -AssemblyName System.Speech
$projectRoot = Split-Path $PSScriptRoot -Parent
$soundRoot = Join-Path $projectRoot 'web-assets/sounds'
$voiceSynth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
    $voiceSynth.SelectVoice('Microsoft Huihui Desktop')
    $voiceSynth.Rate = 1
    $soundMap = Get-Content -LiteralPath (Join-Path $soundRoot 'manifest.json') -Raw -Encoding utf8 | ConvertFrom-Json
    foreach ($entry in $soundMap.PSObject.Properties) {
        if ($Keys.Count -gt 0 -and $entry.Name -notin $Keys) { continue }
        $voiceSynth.SetOutputToWaveFile((Join-Path $soundRoot ($entry.Name + '.wav')))
        # 岛 and 倒(dǎo) have the same third-tone pronunciation; avoid the
        # synthesizer choosing the fourth-tone reading of the polyphonic 倒.
        $spokenText = if ($entry.Name -eq 'duiDao') { ([string]$entry.Value).Replace([char]0x5012, [char]0x5C9B) } else { [string]$entry.Value }
        $voiceSynth.Speak($spokenText)
    }
} finally { $voiceSynth.Dispose() }
