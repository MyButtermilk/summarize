# Firefox Extension Implementation Spec

## Overview

Create a Firefox (Mozilla) version of the existing Chrome extension that is easily maintainable and maximally reuses existing Chrome functionality. The Firefox version should achieve feature parity with Chrome while maintaining a single, shared codebase.

## Goals

- **Feature Parity**: Match all Chrome extension capabilities
- **Code Reuse**: Maximize shared code between Chrome and Firefox
- **Maintainability**: Easy to support both browsers long-term
- **Standard APIs**: Avoid Firefox-specific APIs, use pure WebExtensions
- **Modern Target**: Firefox 131+ (native sidebar support)

## Architecture Decisions

### Codebase Structure

**Chosen approach**: Use WXT multi-browser build with minimal platform divergence

- Single `wxt.config.ts` targeting both `chrome-mv3` and `firefox-mv3`
- Shared codebase in `apps/chrome-extension/` (no rename needed)
- Browser-specific overrides in `apps/chrome-extension/firefox-specific/` folder
- Core logic remains in `@steipete/summarize-core` package (unchanged)

**Rationale**: Simplest long-term maintenance, WXT handles manifest differences, minimal code duplication.

### Manifest Strategy

- **Target**: Firefox Manifest V3 only (Firefox 109+, optimized for 131+)
- **Configuration**: Single config with browser-specific manifest overrides via WXT's `manifest.override` field
- **Permissions**: Use standard WebExtensions permissions model
- **Sidebar API**: Require Firefox 131+ for native sidebar support (analogous to Chrome's Side Panel API)

### Daemon Communication

- **Protocol**: Keep existing HTTP + SSE approach (localhost:9753)
- **CORS**: Add permissive CORS headers in daemon, rely on token-based auth for security
- **Origin Handling**: Token-based auth makes origin checking redundant - trust the Bearer token
- **No Changes**: Daemon code requires only CORS header additions

### Authentication & Pairing

- **Flow**: Reuse exact same flow as Chrome
- **Storage**: Use `browser.storage.local` (compatible API)
- **Token**: Same token generation and Bearer auth mechanism
- **UI**: Reuse existing pairing UI (no Firefox-specific onboarding)

### Connection Management

- **Strategy**: Match Chrome's implementation
- **Reconnection**: If Chrome has exponential backoff reconnection, implement same; otherwise skip
- **No Firefox-specific optimizations**: Don't add Firefox-only reconnection logic

### Browser Compatibility

- **Feature Flags**: Use runtime feature flags per browser in config for handling quirks
- **No Polyfills**: Avoid adding polyfills unless absolutely necessary
- **Standard APIs Only**: No Firefox Containers, Reader Mode, or Firefox Sync integration
- **WebExtensions Only**: Stick to standard `browser.*` APIs

## Technical Implementation

### File Structure Changes

New files/directories to create:

```
apps/chrome-extension/
├── firefox-specific/           # NEW: Firefox-specific overrides (if needed)
│   └── (browser-specific code only when absolutely necessary)
├── docs/firefox.md             # NEW: Firefox-specific documentation
├── wxt.config.ts               # MODIFIED: Add Firefox target
├── package.json                # MODIFIED: Add Firefox build scripts
└── tests/
    └── *.test.ts               # MODIFIED: Add browser compatibility tags
```

### WXT Configuration

Update `apps/chrome-extension/wxt.config.ts`:

```typescript
export default defineConfig({
  // Add Firefox to build targets
  browser: process.env.BROWSER || 'chrome',

  manifest: {
    // Shared manifest fields
    name: 'Summarize',
    // ... existing fields ...

    // Firefox-specific overrides
    override: {
      firefox: {
        // Sidebar API (Firefox 131+)
        sidebar_action: {
          default_panel: 'sidepanel.html'
        },
        // Remove Chrome-specific fields
        side_panel: undefined,
        // Adjust permissions if needed
        permissions: [
          // ... Firefox-compatible permissions
        ]
      }
    }
  }
})
```

### Build Scripts

Add to `apps/chrome-extension/package.json`:

```json
{
  "scripts": {
    "dev": "wxt dev",
    "dev:firefox": "BROWSER=firefox wxt dev",
    "build": "wxt build",
    "build:firefox": "BROWSER=firefox wxt build",
    "build:all": "pnpm build && pnpm build:firefox"
  }
}
```

### Daemon CORS Changes

Modify daemon CORS headers to accept Firefox extension requests:

```typescript
// src/daemon/server.ts (or equivalent)
app.use((req, res, next) => {
  // Allow any extension origin, rely on token auth
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  // ... existing CORS headers
  next();
});
```

### Testing Strategy

**Test Structure**: Use tags/annotations for browser compatibility

```typescript
// tests/pairing.test.ts
import { test, expect } from '@playwright/test';

test('@cross-browser should generate pairing token', async ({ browserType }) => {
  // Runs on both Chrome and Firefox
});

test('@firefox should use correct sidebar API', async ({ page }) => {
  test.skip(browserType.name() !== 'firefox');
  // Firefox-specific test
});

test('@chrome should use Side Panel API', async ({ page }) => {
  test.skip(browserType.name() !== 'chromium');
  // Chrome-specific test
});
```

**Test Execution**:
- Playwright tests run against both Chrome and Firefox builds
- Separate test suites for platform-specific features (tagged)
- WebDriver BiDi for future-proof cross-browser testing
- CI runs full suite on both browsers

Update `apps/chrome-extension/package.json`:

```json
{
  "scripts": {
    "test": "playwright test",
    "test:chrome": "playwright test --grep @chrome|@cross-browser",
    "test:firefox": "playwright test --grep @firefox|@cross-browser"
  }
}
```

## Development Workflow

### Setup

```bash
# Install dependencies (no changes needed)
pnpm install

# Build core package (no changes needed)
pnpm -C packages/core build
```

### Chrome Development (existing)

```bash
# Watch mode
pnpm -C apps/chrome-extension dev

# Build
pnpm -C apps/chrome-extension build

# Load in Chrome
# chrome://extensions → Load unpacked: apps/chrome-extension/.output/chrome-mv3
```

### Firefox Development (new)

```bash
# Watch mode
pnpm -C apps/chrome-extension dev:firefox

# Build
pnpm -C apps/chrome-extension build:firefox

# Load in Firefox
# about:debugging → This Firefox → Load Temporary Add-on
# Select: apps/chrome-extension/.output/firefox-mv3/manifest.json
```

### Testing

```bash
# Test both browsers
pnpm -C apps/chrome-extension test

# Test Firefox only
pnpm -C apps/chrome-extension test:firefox

# Test Chrome only
pnpm -C apps/chrome-extension test:chrome
```

## Compatibility Investigation Needed

**Action Required**: Investigate current Chrome extension code to identify:

1. **Chrome-specific APIs used**:
   - Search for `chrome.` namespace usage
   - Identify APIs that differ in Firefox (even with polyfill)
   - Document in `apps/chrome-extension/docs/firefox.md`

2. **Service Worker vs Background Page**:
   - Current Chrome implementation details
   - Firefox MV3 service worker compatibility
   - Connection lifecycle differences

3. **Content Script Timing**:
   - Verify `run_at` and `document_start/end` behavior matches
   - Test injection timing on both browsers

4. **Storage Quotas**:
   - Check current cache usage
   - Verify Firefox's `storage.local` quota (10MB default) is sufficient
   - Add warnings if approaching limits

5. **SSE/EventSource in Extension Context**:
   - Test streaming summaries work identically in Firefox
   - Verify background script can maintain SSE connection

**Investigation TODO**:
- Grep for `chrome\.` in extension code
- Review all browser API usage in background scripts
- Test streaming on both browsers
- Validate storage usage against Firefox quotas

## Distribution & Deployment

### Build Artifacts

```bash
# Production builds
pnpm -C apps/chrome-extension build      # Chrome: .output/chrome-mv3
pnpm -C apps/chrome-extension build:firefox  # Firefox: .output/firefox-mv3
```

### Installation (Developer Mode)

**Chrome** (existing):
1. `chrome://extensions` → Developer mode ON
2. Load unpacked: `apps/chrome-extension/.output/chrome-mv3`

**Firefox** (new):
1. `about:debugging` → This Firefox
2. Load Temporary Add-on
3. Select: `apps/chrome-extension/.output/firefox-mv3/manifest.json`

**Note**: Both browsers use developer installation initially (no store distribution)

### Future Distribution

- **Chrome**: Continue existing process
- **Firefox**: Consider AMO (Firefox Add-ons) for public release later
- **Versioning**: Lockstep versions across both browsers

## Success Criteria

The Firefox extension is "ready" when ALL of the following are met:

1. **Feature Parity**: All Chrome features work identically in Firefox
   - URL summarization
   - Visible content extraction
   - Auto-summarize on navigation
   - Context menu integration
   - All settings and configurations

2. **Core Functionality**: Essential features work flawlessly
   - Daemon pairing flow completes successfully
   - Summary requests execute without errors
   - Streaming responses display correctly
   - All content types supported (web pages, YouTube, etc.)

3. **Test Coverage**: Automated tests pass
   - All Playwright tests pass on Firefox
   - Browser-tagged tests execute correctly
   - No regressions in Chrome tests

4. **Daemon Integration**: Backend communication works
   - Pairs with daemon using same token mechanism
   - Streams summaries via SSE
   - Handles connection errors gracefully
   - Token auth works identically

## Rollout Plan

**Phase 1: Initial Implementation** (Week 1-2)
- Update WXT config for multi-browser build
- Add Firefox-specific manifest overrides
- Implement sidebar UI (Firefox 131+ sidebar API)
- Update daemon CORS headers
- Create `firefox-specific/` folder structure

**Phase 2: Testing & Validation** (Week 2-3)
- Add browser compatibility tags to tests
- Run Playwright on Firefox build
- Manual testing of all features
- Fix compatibility issues discovered
- Document Firefox-specific behavior

**Phase 3: Public Beta** (Week 3+)
- Ship as temporary add-on (developer installation)
- Share with early adopters
- Gather feedback
- Iterate on bugs and issues

**Phase 4: Stabilization** (Ongoing)
- Monitor usage and error reports
- Fix Firefox-specific bugs
- Maintain parity with Chrome updates
- Consider AMO distribution

## Maintenance Strategy

### Long-Term Approach

**Best-effort parity with documented differences**

- **Goal**: Keep features aligned across browsers
- **Allow**: Browser-specific features if valuable (document clearly)
- **Document**: All known differences in `docs/firefox.md`
- **Flexibility**: Don't block Chrome features for Firefox compatibility

### Version Management

- **Releases**: Aim for simultaneous Chrome + Firefox releases
- **Versioning**: Same version numbers for both browsers
- **Changelog**: Separate sections for browser-specific changes
- **Hotfixes**: Can ship browser-specific hotfixes if needed

### Code Quality

- **Shared Code**: Maximize shared code, minimize `firefox-specific/`
- **Feature Flags**: Use browser flags only for quirks/bugs, not features
- **Documentation**: Keep `docs/firefox.md` updated with all differences
- **Reviews**: Test both browsers before merging PRs

### Monitoring

- **Metrics**: Track usage on both browsers
- **Errors**: Monitor browser-specific error rates
- **Feedback**: Separate feedback channels if needed
- **Updates**: Watch for WXT and browser API changes

## Open Questions & Risks

### Risks

1. **WXT Firefox Support**: Verify WXT's Firefox support is mature enough
2. **Sidebar API Differences**: Firefox sidebar may have subtle UX differences from Chrome Side Panel
3. **Service Worker Lifecycle**: Firefox MV3 service worker behavior may differ
4. **Storage Limits**: Firefox's 10MB default quota might be hit by cache
5. **Testing Complexity**: Maintaining tests for two browsers increases CI time

### Mitigation

- **Early Testing**: Build minimal Firefox version ASAP to validate approach
- **Fallbacks**: Keep Chrome version stable during Firefox development
- **Documentation**: Document all differences for future maintainers
- **Monitoring**: Watch for Firefox-specific error patterns

### Unknown Unknowns

- Firefox-specific bugs not discoverable until real usage
- Browser update breaking changes
- WXT framework updates requiring refactoring

## References

- [WXT Framework Docs](https://wxt.dev/)
- [WebExtensions API](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions)
- [Firefox Sidebar API](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/sidebarAction)
- [Chrome Side Panel API](https://developer.chrome.com/docs/extensions/reference/sidePanel/)

## Next Steps

1. **Investigate Chrome Extension Code** ← START HERE
   - Search for Chrome-specific API usage
   - Identify compatibility concerns
   - Document findings in `docs/firefox.md`

2. **Update WXT Config**
   - Add Firefox build target
   - Configure manifest overrides
   - Add build scripts

3. **Create Firefox-Specific Structure**
   - Create `firefox-specific/` folder (if needed)
   - Create `docs/firefox.md`
   - Update README with Firefox instructions

4. **Implement Sidebar UI**
   - Map Chrome Side Panel to Firefox Sidebar
   - Test UI rendering in Firefox
   - Verify all interactions work

5. **Update Daemon**
   - Add permissive CORS headers
   - Test with Firefox extension
   - Verify token auth works

6. **Add Testing Infrastructure**
   - Tag existing tests for browser compatibility
   - Add Firefox Playwright config
   - Run tests on both browsers

7. **Manual Testing**
   - Install in Firefox Developer Edition
   - Test all features end-to-end
   - Document any quirks

8. **Documentation**
   - Update CLAUDE.md with Firefox dev workflow
   - Create Firefox-specific troubleshooting guide
   - Update README with Firefox installation

9. **Public Beta**
   - Share temporary add-on installation instructions
   - Collect feedback
   - Iterate

## Implementation Checklist

- [ ] Investigate current Chrome API usage
- [ ] Create `firefox-specific/` folder
- [ ] Create `docs/firefox.md`
- [ ] Update `wxt.config.ts` with Firefox target
- [ ] Add Firefox build scripts to `package.json`
- [ ] Update daemon CORS headers
- [ ] Implement Firefox sidebar UI
- [ ] Add browser compatibility tags to tests
- [ ] Configure Playwright for Firefox
- [ ] Run full test suite on Firefox
- [ ] Manual testing in Firefox Developer Edition
- [ ] Document all Firefox-specific behaviors
- [ ] Update CLAUDE.md and README
- [ ] Create installation guide for Firefox users
- [ ] Ship public beta
- [ ] Gather feedback and iterate

---

**Status**: Specification complete, ready for implementation

**Owner**: TBD

**Target**: Public beta in 3 weeks
