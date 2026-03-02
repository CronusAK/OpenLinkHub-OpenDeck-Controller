# Fan Profile Control

OpenDeck plugin for controlling Corsair fan speed profiles via [OpenLinkHub](https://github.com/jurkovic-nikola/OpenLinkHub) on [OpenDeck](https://github.com/nekename/OpenDeck).

## Requirements

- OpenLinkHub running on `http://127.0.0.1:27003`
- Linux

## Actions

**Current Fan Profile** — Displays the active fan speed profile. Updates every 10 seconds to maintain accuracy if updated outside the plugin. Icon is only redrawn if a change is detected. Press to refresh immediately.

**Set Fan Profile** — Opens a property inspector dropdown listing available profiles. Built-in presets (Quiet, Normal, Performance) are always shown. Custom fan profiles created in OpenLinkHub are also supported. Press the key to apply the selected profile to all speed-capable devices.

**Set RGB Profile** — Lists all RGB profiles defined in OpenLinkHub. Select one and Press the key to apply the selected profile to all RGB-capable devices.

##
**Optional Configuration** - Use the OpenDeck MultiAction to set both fan and RGB profiles or ToggleAction to switch between two fan or RGB profiles. 

## Installation

Install the `.streamDeckPlugin` file from `builds/` through the OpenDeck application.
