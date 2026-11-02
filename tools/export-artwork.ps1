param([Parameter(Mandatory=$true)][string]$Source,[Parameter(Mandatory=$true)][string]$RelativePath,[Parameter(Mandatory=$true)][int]$Width,[Parameter(Mandatory=$true)][int]$Height,[string]$Series='',[switch]$TrimTransparent,[int]$Padding=0)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$projectRoot=Split-Path $PSScriptRoot -Parent
$artRoot=Join-Path $projectRoot 'output/artwork/complete-set-v1'
$destination=Join-Path (Join-Path $projectRoot 'assets/resources') $RelativePath
$master=Join-Path (Join-Path $artRoot 'masters') $RelativePath
New-Item -ItemType Directory -Path (Split-Path $destination -Parent),(Split-Path $master -Parent) -Force | Out-Null
Copy-Item -LiteralPath $Source -Destination $master -Force
$inputImage=[System.Drawing.Bitmap]::new($Source)
$sourceRect=[System.Drawing.Rectangle]::new(0,0,$inputImage.Width,$inputImage.Height)
if($TrimTransparent){
    if(-not ('MahjongArtworkAlphaBounds' -as [type])){
        Add-Type -TypeDefinition @'
using System;
public static class MahjongArtworkAlphaBounds {
 public static int[] Find(byte[] bytes,int width,int height,int stride) {
    int x0=width,y0=height,x1=-1,y1=-1;
    for(int y=0;y<height;y++)for(int x=0;x<width;x++)if(bytes[y*stride+x*4+3]>=24){x0=Math.Min(x0,x);y0=Math.Min(y0,y);x1=Math.Max(x1,x);y1=Math.Max(y1,y);}
    if(x1<0)throw new Exception("Empty artwork");
    x0=Math.Max(0,x0-4);y0=Math.Max(0,y0-4);x1=Math.Min(width-1,x1+4);y1=Math.Min(height-1,y1+4);
    return new int[]{x0,y0,x1-x0+1,y1-y0+1};
 }
}
'@
    }
    $data=$inputImage.LockBits($sourceRect,[System.Drawing.Imaging.ImageLockMode]::ReadOnly,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
        $bytes=[byte[]]::new($data.Stride*$data.Height)
        [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0,$bytes,0,$bytes.Length)
        $bounds=[MahjongArtworkAlphaBounds]::Find($bytes,$inputImage.Width,$inputImage.Height,$data.Stride)
        $sourceRect=[System.Drawing.Rectangle]::new($bounds[0],$bounds[1],$bounds[2],$bounds[3])
    } finally { $inputImage.UnlockBits($data) }
}
$outputImage=[System.Drawing.Bitmap]::new($Width,$Height,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics=[System.Drawing.Graphics]::FromImage($outputImage)
$graphics.Clear([System.Drawing.Color]::Transparent)
$graphics.CompositingMode=[System.Drawing.Drawing2D.CompositingMode]::SourceCopy
$graphics.CompositingQuality=[System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$graphics.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.PixelOffsetMode=[System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$ratio=[Math]::Min(($Width-2*$Padding)/$sourceRect.Width,($Height-2*$Padding)/$sourceRect.Height)
$scaledWidth=[int][Math]::Round($sourceRect.Width*$ratio)
$scaledHeight=[int][Math]::Round($sourceRect.Height*$ratio)
$destRect=[System.Drawing.Rectangle]::new([int](($Width-$scaledWidth)/2),[int](($Height-$scaledHeight)/2),$scaledWidth,$scaledHeight)
$graphics.DrawImage($inputImage,$destRect,$sourceRect,[System.Drawing.GraphicsUnit]::Pixel)
$graphics.Dispose()
$outputImage.Save($destination,[System.Drawing.Imaging.ImageFormat]::Png)
$receipt=[ordered]@{path=$RelativePath;width=$Width;height=$Height;method='individual-image-generation';series=$Series;source=$Source;sourceWidth=$inputImage.Width;sourceHeight=$inputImage.Height;trimTransparent=[bool]$TrimTransparent;padding=$Padding;sourceRect=@($sourceRect.X,$sourceRect.Y,$sourceRect.Width,$sourceRect.Height);cornerAlpha=$outputImage.GetPixel(0,0).A;master=$master}
$inputImage.Dispose()
$outputImage.Dispose()
$receiptFile=Join-Path $artRoot ('receipts/'+($RelativePath.Replace('/','__').Replace('.png','.json')))
New-Item -ItemType Directory -Path (Split-Path $receiptFile -Parent) -Force | Out-Null
$receipt|ConvertTo-Json|Set-Content -LiteralPath $receiptFile -Encoding utf8
Write-Output $RelativePath
