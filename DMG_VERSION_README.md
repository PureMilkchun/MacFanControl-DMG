# MacFanControl 2.0 DMG (4-file version)

This repository contains the 4-file version of MacFanControl 2.0 DMG.

## Contents

- `MacFanControl.app` - Main application bundle
- `install.command` - Installation script (requires administrator password)
- `kentsmc` - Helper tool for fan control
- `uninstall.command` - Uninstallation script

## Installation

1. Double-click `install.command`
2. Enter your administrator password when prompted
3. The script will install `kentsmc` to `/usr/local/bin` and configure sudoers for passwordless execution
4. `MacFanControl.app` will be copied to `/Applications`

## Notes

- This version has a simpler installation script that doesn't include detailed macOS security bypass instructions
- For users who need guidance on bypassing macOS security warnings for unsigned applications, please refer to the v2 version in the `macfan-control-v2` directory
- The core application and helper tool are identical to the v2 version

## Version Comparison

This 4-file version differs from the 6-file v2 version in:
- Simpler `install.command` script without detailed security bypass instructions
- No additional `安装说明.txt` (installation guide in Chinese/English)
- No duplicate `install.sh` script

Both versions contain the same core application (`MacFanControl.app`) and helper tool (`kentsmc`).