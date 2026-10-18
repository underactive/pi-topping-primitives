# Changelog

All notable changes to this package are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this package
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `./contracts` for 0.1.0: `CHANNELS`, `Channel`, `ENTRY_TYPES`, `EntryType`, `PI_VIRTUAL_MODEL_API`, `WORKING_STATUS_SLIDE_MS`, `RouteReason`, `RoutedModelAnnouncementV1`, `ParsedRoutedModel`, `EmbeddedAnnouncement`, `ChannelPayloads`, `ParsedChannelPayloads`, `SavingsEntry`, `CompactionOutcomeEntry`, `BrowserFeedPayload`, `EntryPayloads`, `EventBusLike`, `parseRoutedModel`, `parseEmbeddedAnnouncement`, `emit`, and `subscribe`.
- Package scaffold: subpath exports whose default target is the TypeScript source and whose compiled target is the dist output. Every subpath is an empty stub until its phase lands. Tested against pi 1.3.0 by hand, with `scripts/probe-pi-loader.sh` and `scripts/verify-loader.sh`; neither runs in CI.
