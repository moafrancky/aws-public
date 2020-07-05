###Instance Role

Policy Managed AmazonSSMManagedInstanceCore

Policy S3 Bucket Access

```
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "ListObjectsInBucket",
            "Effect": "Allow",
            "Action": [
                "s3:ListBucket"
            ],
            "Resource": [
                "arn:aws:s3:::REPLACEWITHBUCKETNAME"
            ]
        },
        {
            "Sid": "VisualEditor0",
            "Effect": "Allow",
            "Action": [
                "s3:Get*",
                "s3:List*"
            ],
            "Resource": "arn:aws:s3:::REPLACEWITHBUCKETNAME/*"
        }
    ]
}
```

###Instance Userdata

```
<powershell>
$adminpassword=(Get-SSMParameter -Name 'hmailserver-admin-password').value
$s3bucket=(Get-SSMParameter -Name 'hmailserver-s3-installationfiles-bucket').value

write-host ""

write-host "Installing .Net..."
Install-WindowsFeature Net-Framework-Core

write-host "Downloading HMS..."
Read-S3Object -BucketName $s3bucket -key "hMailServer-5.6.7-B2425.exe" -File:"c:\users\administrator\downloads\hmailserver-setup.exe"

write-host "Installing HMS..."
c:\users\administrator\downloads\hmailserver-setup.exe /verysilent

Start-Sleep -Seconds 2

$hmsService = $null
$tries = 0
while ($tries++ -lt 10 -and ($hmsService -eq $null))
{
write-host "Waiting for hMailServer service to exist..."
Start-sleep -Seconds 2
($hmsService = get-service -Name hmailserver -ErrorAction SilentlyContinue) | Out-Null
}

$tries = 0
while ($tries++ -lt 10 -and ($hmsService -eq $null -or $hmsService.Status -ne "Running"))
{
write-host "Waiting for hMailServer service to start..."
if ($hmsService -ne $null -and $hmsService.Status -eq "Stopped") { $hmsService | Start-Service }
Start-sleep -Seconds 2
($hmsService = get-service -Name hmailserver -ErrorAction SilentlyContinue) | Out-Null
}

$hm = $null
$tries = 0
while (($hm -eq $null) -and ($tries++ -lt 5))
{
write-host "Trying to create hMailServer COM interface..."
$hm = New-Object -ComObject hMailServer.Application
Start-sleep -seconds 2
}

$hm.Authenticate("administrator", "") | Out-Null

write-host "Set HMS admin password..."
$hm.Settings.SetAdministratorPassword($adminpassword)

write-host "Changing hostname and reboot..."
Rename-Computer -NewName "hmailserver" -Restart -ErrorAction Stop
</powershell>
```

Credits https://www.hmailserver.com/forum/viewtopic.php?t=31541