# Design QA — 会话与系统设置融合版（2026-10-14）

## Source and evidence

- Selected source: `/Users/yanjianghua/.codex/generated_images/01a12504-3099-7350-9893-28368706347f/exec-113a7a23-0cd5-4846-8eb6-fe36dc697fc4.png` (1487 × 1058).
- Desktop captures, 1440 × 1024: [会话](artifacts/session-settings-fusion/session-desktop.png), [设置](artifacts/session-settings-fusion/settings-desktop.png).
- Full-page mobile captures, viewport 390 × 844: [会话](artifacts/session-settings-fusion/session-mobile.png), [设置](artifacts/session-settings-fusion/settings-mobile.png).
- Medium capture, viewport 900 × 1024: [会话](artifacts/session-settings-fusion/session-medium.png).
- Source and desktop implementation images were inspected together in one comparison input. This was not a pixel overlay or a composited side-by-side image.

## Five-surface review

- Visual fidelity: reproduced the selected fusion's white canvas, tinted summary strip, left selector/right workspace, and QR generation button inside the QR stage. Kept the existing application navigation rather than replacing the global shell with the mock's slim sidebar. Real account data replaces fictional reference data.
- Product clarity: account status precedes connection actions; settings separates schedule, rules and account connection. Descriptions remain short. The QR icon is a pre-generation empty state, not a scannable code.
- Interaction: verified all three connection methods and all three settings categories. Hidden panels remain mounted, preserving form state. No login, credential save, schedule save or external QR request was submitted during this visual check.
- Responsive layout: both routes have no document horizontal overflow at 390 and 900 px. At 900 px QR instructions stack below the QR stage; at 390 px navigation and workspace become one column. The existing mobile shell's pale brand text is outside this two-route redesign and remains unchanged.
- Accessibility: native buttons expose pressed state and controlled section IDs; headings, form labels and existing visible focus styles are retained. No decorative raster asset was added.

## Iterations and validation

1. Desktop comparison found inherited gradient/shadow styling on primary actions; scoped solid-color overrides were added and the page recaptured.
2. Mobile inspection found direction-dependent “左侧” instructions; removed the positional wording for stacked layouts.
3. Rechecked desktop, medium and mobile layouts and section switches. Browser console reported no errors.

- `npm run typecheck`: passed.
- `npm test`: 119 tests passed.
- `npm run build`: passed.
- Loader/action logic and local-only credential restrictions are unchanged. These checks do not certify a new end-to-end Bilibili authentication attempt.

Result: **passed for the scoped two-route design implementation**, with the documented preserved global-shell differences. Not committed or deployed in this turn.

### Follow-up: user-readable schedule controls

- Replaced the default Cron field with hourly/3-hour/6-hour/12-hour/daily choices and exact Beijing-time execution descriptions. The current-plan summary now uses readable labels.
- Advanced mode retains the original expression; unknown expressions are not silently converted. The existing server action, permissions and scheduler remain unchanged.
- Checked advanced-mode switching and frequency selection without saving a different schedule. Desktop and 390 px mobile screenshots: [desktop](artifacts/session-settings-fusion/settings-frequency-desktop.png), [mobile](artifacts/session-settings-fusion/settings-frequency-mobile.png). Mobile document width remains 390 px.
- Typecheck, build and 122 tests passed. Three new tests cover default-plan preservation, valid preset expressions and custom-plan detection.

---

# Design QA — 数据情报工作台前端重构

## Evidence

- Visual source: `/Users/yanjianghua/.codex/generated_images/01a055e0-2a79-74c2-9a6b-9b76c28e4759/exec-c0d3c856-2cad-4d94-a01d-81cf6fd17d48.png`
- Final dashboard at `1440 × 1024`: `/Users/yanjianghua/WebstormProjects/bilibili-web-crawler/artifacts/redesign-dashboard-1440x1024.png`
- Side-by-side comparison: `/Users/yanjianghua/WebstormProjects/bilibili-web-crawler/artifacts/design-qa-comparison.png`
- Review workspace: `/Users/yanjianghua/WebstormProjects/bilibili-web-crawler/artifacts/redesign-reviews-1440x1024.png`
- Weapon library: `/Users/yanjianghua/WebstormProjects/bilibili-web-crawler/artifacts/redesign-builds-1440x1024.png`
- Medium breakpoint: `/Users/yanjianghua/WebstormProjects/bilibili-web-crawler/artifacts/redesign-dashboard-900x1024.png`
- Narrow breakpoint: `/Users/yanjianghua/WebstormProjects/bilibili-web-crawler/artifacts/redesign-dashboard-390x844.png`
- Narrow navigation drawer: `/Users/yanjianghua/WebstormProjects/bilibili-web-crawler/artifacts/redesign-mobile-drawer-390x844.png`
- Runtime state: authenticated local administrator with real creator, crawl-run, candidate and weapon-build data.

## Visual Match

- The implementation preserves the selected direction's dark intelligence rail, warm neutral canvas, cyan primary action, green health signal and restrained amber attention treatment.
- The desktop composition follows the reference hierarchy: brand/navigation rail, compact top status, operational metrics, primary work inbox, recent crawl trend and latest build versions.
- Actual product state contains no pending candidates or weapon discoveries, so the reference's two inbox rows are represented by an explanatory empty state instead of fabricated records.
- Typography, divider density, table rhythm, 8 px spacing scale and restrained 8–12 px radii remain consistent across routes.
- All interface icons use `@ant-design/icons`; no CSS drawings, fake weapon assets or decorative placeholder imagery were added.

## Product and Interaction QA

- The dashboard exposes one primary action (`立即抓取`) and one secondary fallback (`手动导入`), with current database and Worker health visible before the metrics.
- Candidate review separates code confidence from weapon-attribution confidence. Unresolved weapons cannot be directly accepted and link to weapon confirmation.
- Creator actions use row-specific fetcher loading states. Schedule editing remains a drawer and retains inherited/custom Cron semantics.
- Weapon builds, directory and discoveries remain task-oriented tabs. Codes use a consistent copy control and versions link to traceable history.
- Audit details are expandable formatted JSON rather than an unreadable inline string.
- The Bilibili session route keeps QR as the preferred method and preserves the existing local-only restrictions for sensitive inputs.
- All nine authenticated routes loaded successfully in Chrome without route-level errors or page overflow at `1280 px`.

## Responsive and Accessibility QA

- `1440 × 1024`: full navigation and two-column lower workbench.
- `900 × 1024`: drawer navigation, three-column metric grid and stacked lower panels.
- `390 × 844`: two-column metrics, wrapped page actions, no viewport overflow, and a usable 288 px navigation drawer.
- Interactive targets are at least 40 px, keyboard focus is visible, semantic headings/tables/buttons are retained, and reduced-motion preferences disable non-essential animation.
- Wide tables use internal horizontal scrolling rather than forcing document overflow.

## Iteration History

### Pass 1

- [P1] Ant Design did not initially identify the outer shell as a side-by-side layout, placing the main workspace below the full-height rail.
- [P2] Mobile header brand text inherited the dark-rail foreground and disappeared on the warm header.
- [P2] The mobile Drawer used a deprecated width prop and emitted a console warning.
- [P2] The review empty state used Ant Design's default English message.

Fixes:

- Declared the outer layout as `hasSider` and verified its desktop bounding boxes.
- Added an explicit mobile brand foreground token.
- Moved the Drawer width to responsive CSS and removed the deprecated prop.
- Added a Chinese review empty state.

### Pass 2

- Re-captured the dashboard at the exact `1440 × 1024` viewport and regenerated the combined comparison.
- Verified a fresh Chrome tab reports no console errors or warnings.
- Verified all authenticated routes at `1280 px`, then repeated layout checks at `900 px` and `390 px`.
- No actionable P0, P1 or P2 visual, responsive, interaction or accessibility differences remain.

## Validation

- `npm run typecheck`: passed.
- `npm test`: 7 files and 26 tests passed.
- `npm run build`: passed.
- `/health`: Web, PostgreSQL, Worker and Bilibili credential all healthy.

final result: passed

# Design QA Update — 抓取趋势图例右对齐

## Evidence

- Source screenshot: `/var/folders/zq/rvshm3r137z54sv1h1f8160w0000gn/T/codex-clipboard-110c6a9a-0c01-4f41-85e6-ec4625036ae7.png`.
- Implementation was refreshed and inspected in the authenticated local dashboard at `http://127.0.0.1:8088/` using the same visible chart state.
- Side-by-side comparison: the source keeps the built-in paginated legend at the upper left; the implementation shows both complete series labels (`扫描视频`, `候选码`) together at the upper right, above the plot and clear of the x-axis.

## Findings and Resolution

- The previous change targeted the floating data tooltip, while the persistent element visible in the source was the chart legend.
- AntV G2 maps both `top-left` and `top-right` to the same top layout region in this installed version, so changing `position` alone did not right-align the content.
- Replaced the built-in paginated legend with an Ant Design `Badge` legend anchored to the chart's upper-right corner and disabled the built-in legend.
- Kept the hover tooltip separately anchored below the legend so the two feedback layers cannot overlap.
- The chart plot and x-axis retain their existing height and spacing; no visible clipping or compression remains.

## Validation

- Browser visual check: passed; both series labels are visible at the upper right.
- `npm run typecheck`: passed.
- `npm test -- --run`: 11 files and 63 tests passed.
- `npm run build`: passed.
- `git diff --check`: passed.

final result: passed

---

# Design QA Update — 趋势图 Tooltip 与方案卡片自适应

## Evidence

- Source visual truth (PSG-1, 3 rows): `/var/folders/zq/rvshm3r137z54sv1h1f8160w0000gn/T/codex-clipboard-83063e14-fdd5-4bec-8eb9-cb71c27759e4.png`
- Source visual truth (SKS, 2 rows): `/var/folders/zq/rvshm3r137z54sv1h1f8160w0000gn/T/codex-clipboard-6ef2e86c-daf3-41c2-bfc6-4237b76b810f.png`
- Previous chart problem reference: `/var/folders/zq/rvshm3r137z54sv1h1f8160w0000gn/T/codex-clipboard-d72bc053-f067-4ec9-8154-2b43425907f2.png`
- Implementation capture: `/Users/yanjianghua/WebstormProjects/bilibili-web-crawler/artifacts/design-qa-2026-09-04/builds-adaptive-full.jpg`
- Focused source/implementation comparison: `/Users/yanjianghua/WebstormProjects/bilibili-web-crawler/artifacts/design-qa-2026-09-04/builds-source-vs-final.png`
- Browser viewport: `1267 × 454` CSS px. The in-app browser screenshot is captured at a half-scale content density inside a `1267 × 1656` stitched image; focused comparison was normalized to a common `905 × 334` panel frame.
- State: authenticated administrator; PSG-1, SKS and MK4 expanded separately to validate 3, 2 and 6 nested rows.

## Pass 1 — Findings

- P1: The chart tooltip followed the pointer and could cover the x-axis labels and data line.
- P1: The expanded weapon card appeared to have a fixed-height clipping problem. DOM measurement showed the outer card already used auto height, but the nested Ant Design table injected `margin: -12px -8px -12px 44px`; combined with rounded-card clipping, its final row extended 11 px past the visible card boundary.

## Pass 2 — Fixes and Measurements

- The tooltip is anchored to the chart plot's upper-right corner with `top: 12px`, `right: 16px`, no transform and no pointer capture. Runtime geometry was tooltip `675–817 × 113–205` inside chart `261–851 × 97–357`, leaving the x-axis area unobstructed.
- Removed fixed nested header/body heights and kept only content padding, so long labels can increase row height without clipping.
- Neutralized only the nested build table's generated negative margin; outer Ant Design table spacing remains unchanged.
- PSG-1 (3 rows): panel height `334px`, client height `332px`, scroll height `332px`, table bottom one pixel inside the card.
- SKS (2 rows): panel height `263px`, client height `261px`, scroll height `261px`, table bottom one pixel inside the card.
- MK4 (6 rows): panel height `547px`, client height `545px`, scroll height `545px`, table bottom one pixel inside the card.
- No internal scrollbar, hidden final row, overlap or x-axis obstruction remains.

## Validation

- `npm run typecheck`: passed.
- `npm test -- --run`: 11 files and 63 tests passed.
- `npm run build`: passed.
- `git diff --check`: passed.

final result: passed

---

# Design QA Update — S11 切换与浮层遮挡修复（2026-09-04）

## Evidence

- Source truth — expanded table obstruction: `/var/folders/zq/rvshm3r137z54sv1h1f8160w0000gn/T/codex-clipboard-f32cf883-029c-465e-94f6-1e28918ba268.png`
- Source truth — chart tooltip obstruction: `/var/folders/zq/rvshm3r137z54sv1h1f8160w0000gn/T/codex-clipboard-d72bc053-f067-4ec9-8154-2b43425907f2.png`
- Implementation — expanded PSG-1 state: `/Users/yanjianghua/WebstormProjects/bilibili-web-crawler/artifacts/design-qa-2026-09-04/builds-expanded-final.png`
- Implementation — dashboard chart and axis: `/Users/yanjianghua/WebstormProjects/bilibili-web-crawler/artifacts/design-qa-2026-09-04/dashboard-axis-final.png`
- Combined comparisons: `/Users/yanjianghua/WebstormProjects/bilibili-web-crawler/artifacts/design-qa-2026-09-04/builds-source-final-comparison.jpg` and `/Users/yanjianghua/WebstormProjects/bilibili-web-crawler/artifacts/design-qa-2026-09-04/dashboard-source-final-comparison.jpg`
- Browser viewport: `1267 × 454` CSS px, device scale factor 1. States: authenticated administrator, PSG-1 expanded; dashboard scrolled to the seven-day trend chart.

## Comparison History

### Pass 1

- [P1] The current season was still presented as S10 on the first day of S11.
- [P1] The icon-button tooltip persisted over the expanded weapon panel and obscured its heading.
- [P1] The chart tooltip opened below the pointer and covered X-axis labels.

### Pass 2

- Added the S11 boundary at `2026-09-04 00:00:00 +08:00`; the current column now reads `S11` and explicitly labels inherited S10 schemes as `沿用 S10`.
- Removed the visible tooltip from the weapon expand/collapse control while retaining its Chinese `aria-label` and `aria-expanded` semantics.
- Moved the G2 tooltip above its anchor with a height-aware transform. Browser geometry verification measured the tooltip at `y=21–113`, while X-axis labels begin near `y=160`, leaving about 47 px of clearance.
- Rechecked the two combined source/implementation comparisons. No P0, P1 or P2 obstruction, hierarchy, spacing or season-label findings remain.

## Validation

- S11 date-boundary and carry-forward behavior are covered by automated tests.
- Expanded-row interaction remains keyboard-accessible and no longer creates a visible overlay.
- The trend chart keeps a 42 px bottom plot inset and the tooltip no longer intersects its X-axis.

final result: passed

---

# Design QA Update — 展开表格与趋势图遮挡修复

## Evidence

- Source visual truth: `/var/folders/zq/rvshm3r137z54sv1h1f8160w0000gn/T/codex-clipboard-2fe66402-0647-4f17-a2f3-f8638a1f0765.png` and `/var/folders/zq/rvshm3r137z54sv1h1f8160w0000gn/T/codex-clipboard-8877afa6-279f-4b88-aea6-d196d2d6f961.png`.
- Rendered implementation: live Codex in-app browser captures from `/builds` with PSG-1 expanded and `/` with the trend chart scrolled into view. The browser API emitted the PNG evidence directly and did not expose a filesystem path.
- Viewport: `1267 × 625` CSS px at the active browser density.
- State: authenticated administrator; PSG-1 expanded with the current S10 bucket; dashboard populated with seven days of crawl data and two recent runs.

## Findings and Iteration History

### Pass 1

- [P1] The nested weapon panel used a viewport-derived width inside a horizontally scrollable table cell. Its independent width and sticky positioning let it cross the real expanded-cell boundary and appear beneath adjacent table layers.
- [P1] The chart had only two effective pixels below its 196 px canvas because the 214 px container also supplied vertical padding. The X-axis labels consequently touched the activity separator and appeared clipped.

Fixes:

- Made the nested panel a normal `width: 100%` child of the expanded cell, removed viewport-width breakpoint formulas, added stacking isolation, and increased the expanded row's top/bottom safety padding.
- Increased the chart region to 244 px, set the rendered line chart to 214 px, and reserved 34 px of internal bottom padding plus 8 px label spacing for the X axis.

### Pass 2

- The expanded PSG-1 panel remains fully inside its parent row; its heading, season selector, table header, rows, and rounded border are unobstructed.
- All seven X-axis dates are visible above the recent-activity separator. Browser geometry confirms the chart ends exactly where the activity region begins, with no document-level horizontal overflow (`scrollWidth = clientWidth = 1267`).
- No actionable P0, P1, or P2 difference remains.

## Required Fidelity Surfaces

- Typography: unchanged; labels and table hierarchy retain the existing weights and line heights.
- Spacing/layout: corrected at the expanded-row boundary and chart baseline; table and chart now follow their parent containers.
- Colors/tokens: unchanged and still theme-driven.
- Image quality/assets: no image or icon assets changed.
- Copy/content: unchanged; only presentation constraints were modified.

## Validation

- `npm run typecheck`: passed.
- `npm test`: 11 files and 62 tests passed.
- `npm run build`: client and SSR production builds passed; only the existing non-blocking large-chunk advisory remains.
- `git diff --check`: passed.

final result: passed

---

# Design QA Update — 全项目共享组件库与按钮体系

## Evidence

- Source visual truth: `/Users/yanjianghua/WebstormProjects/bilibili-web-crawler/artifacts/product-design-audit/layout-alignment-after/01-builds.png`
- Component catalog implementation: `/Users/yanjianghua/WebstormProjects/bilibili-web-crawler/artifacts/product-design-qa/component-library/01-design-system-cropped.png`
- Builds implementation: `/Users/yanjianghua/WebstormProjects/bilibili-web-crawler/artifacts/product-design-qa/component-library/02-builds-after-1280x720.png`
- Combined source and implementation: `/Users/yanjianghua/WebstormProjects/bilibili-web-crawler/artifacts/product-design-qa/component-library/04-builds-comparison-1280x720.png`
- Viewport and normalization: the source is `1280 × 720` px at density 1. The implementation was captured from the Codex in-app browser at `2560 × 1220` physical px (approximately `1280 × 610` CSS px at density 2), normalized to `1280 × 610` and padded to `1280 × 720` only for equal-canvas comparison.
- State: authenticated administrator, weapon dictionary route, first weapon group expanded; component catalog modal and drawer tested separately.

## Findings

- No actionable P0, P1 or P2 differences remain. The shared components preserve the established deep navigation rail, warm content canvas, cyan primary action, compact table rhythm and restrained semantic states.
- Typography retains the existing Inter/Noto Sans SC hierarchy and optical weights. Button labels remain legible at page and row scale without wrapping.
- Spacing and layout rhythm remain stable after replacing route-level controls. Page actions keep one primary action, row actions use compact grouping, and 40 px interaction targets remain consistent.
- Colors and tokens continue to come from the central Ant Design theme; primary, warning, success and destructive states remain text-labeled rather than color-only.
- Image quality is unchanged: the existing brand image is retained and all interface symbols use Ant Design Icons. No placeholder imagery, handcrafted SVG, CSS art or emoji was introduced.
- Copy in the component catalog explains when each semantic component should be used and does not expose implementation-only prompt text.

## Full-view and Focused Comparison

- The equal-canvas comparison shows the weapon dictionary hierarchy, toolbar, table grouping and expansion behavior remain visually consistent after the shared-component migration. The implementation capture is shorter because the Codex browser pane had a smaller vertical CSS viewport; the padded area was excluded from visual judgments.
- The component-catalog capture provides the focused evidence needed for button hierarchy, loading/disabled/destructive states, status labels, data cells and panel spacing; a further crop was unnecessary because all relevant controls are readable.

## Interaction, Accessibility and Route QA

- Verified all ten authenticated routes plus one real build-detail route; every route rendered its expected page content without an error boundary.
- Verified shared modal open/close, shared drawer open/close, router-aware action links, disabled/loading controls, copy-code controls and weapon-group expansion semantics.
- Icon-only actions expose an accessible name and Tooltip. Destructive user deletion is wrapped in the shared confirmation component.
- Checked browser logs after the final changes: zero current console errors or warnings.
- Existing 900 px and 390 px layout rules remain unchanged; the component catalog switches its two-column grid to one column at 900 px and shared action groups retain 40 px targets.

## Comparison History

### Pass 1

- [P2] The shared drawer emitted an Ant Design deprecation warning because the underlying Drawer received `width`.
- Fix: the wrapper now maps its public width value to Ant Design 6 `size`, keeping the route-facing API stable.
- Post-fix evidence: reopened the drawer from `/design-system`; it rendered at the intended width with no current console errors or warnings.

### Pass 2

- Re-ran the complete route smoke check, modal and drawer interactions, type checking, 62 tests and both client and SSR production builds.
- No remaining P0/P1/P2 visual, interaction, accessibility or architecture findings.

## Validation

- `npm run typecheck`: passed.
- `npm test`: 11 files and 62 tests passed.
- `npm run build`: client and SSR production builds passed; only the existing non-blocking large-chunk advisory remains.
- `git diff --check`: passed.

final result: passed

---

# Design QA Update — Ant Design Pro 化全项目 UI

## Evidence

- User reference: `/var/folders/zq/rvshm3r137z54sv1h1f8160w0000gn/T/codex-clipboard-86d66d87-0a7c-41a4-a2a9-8223ce6d891f.png`
- Final implementation: `/Users/yanjianghua/WebstormProjects/bilibili-web-crawler/artifacts/design-qa/builds-1440x1024.jpg`
- Combined reference and implementation review: `/Users/yanjianghua/WebstormProjects/bilibili-web-crawler/artifacts/design-qa/builds-comparison-1440.jpg`
- Primary route: `http://127.0.0.1:8088/builds`
- Tested viewports: `1440 × 1024`, `1280 × 800`, `900 × 1024`, and `390 × 844` CSS px.

## Documentation-Aligned Decisions

- Locked `@ant-design/pro-components` to `3.1.14-7` and retained React Router loaders, actions, fetchers, links, and permissions as the data and navigation layer.
- Applied ProLayout's fixed side layout with fluid content, PageContainer page slots, display-only ProTable instances, ProCard grouping, ProForm forms, and ProDescriptions detail views.
- Consolidated Ant Design 6 global and component tokens in one theme module and replaced fragile internal selector dependencies with component configuration where available.
- Added Ant Design App context and keyed fetcher toast feedback without changing action payloads or backend contracts.

## Comparison and Iteration History

- Corrected the ProComponents server/client style hash mismatch by providing the browser runtime environment and disabling hashed class generation consistently.
- Removed content token leakage from the dark navigation theme so statistic cards and content containers remain light while the sidebar stays deep green.
- Moved desktop header actions into a dedicated sticky content topbar because this ProLayout version placed side-layout actions in the sidebar footer.
- Constrained expanded weapon tables to the visible parent-table width and restored fixed object/action columns by preventing unused column-state processing on nested tables.
- Removed the duplicate mobile topbar and kept a single ProLayout mobile header with hamburger, brand, and account access.
- Replaced deprecated Modal and pagination properties and corrected nested-link and ProForm context warnings.

## Product and Route QA

- Verified `/`, `/reviews`, `/creators`, `/runs`, `/bilibili-session`, `/settings`, `/users`, `/audit`, and `/builds` in a fresh browser session.
- Every checked route rendered its expected Chinese page title with no error boundary, console error, or document-level horizontal overflow.
- Verified weapon-group expand/collapse, inner-table containment, fixed action columns, URL-backed filters, density and column controls, pagination, user modal presentation, and copy-code feedback.
- Copying a weapon code displayed the expected `改枪码已复制` toast.
- At 900 px and 390 px, navigation switches to the mobile drawer/header pattern; actions and filters stack while wide tables scroll inside their own containers.
- Statuses retain text labels, keyboard focus remains visible, and controls use the shared 40 px interaction height.

## Validation

- `npm run typecheck`: passed.
- `npm run test`: 10 files and 45 tests passed.
- `npm run build`: client and SSR production builds passed.
- `git diff --check`: passed.
- Production build reports only the existing non-blocking Vite large-chunk advisory.

final result: passed

---

# Design QA Update — 全项目表格与分页统一

## Documentation Review

- Ant Design Pagination: verified `position`, `hideOnSinglePage`, `showLessItems`, `showTotal`, `responsive` and page-size behavior against the official component API.
- Ant Design Table: retained semantic column alignment through each column's `align` option instead of compensating with cell padding or transforms.

## Findings and Resolution

- The previous pagination split the total count to the far left and navigation to the far right, creating a false empty footer band. Pagination is now one compact control group aligned to the lower-right edge of the table.
- Pagination totals now report the visible range (`1–10 / 共 11 种武器`), single-page tables hide the footer entirely, and narrow screens place the total on its own centered row.
- Text-heavy columns remain left-aligned; status, counts, dates and actions use centered column alignment. Table headers and cells therefore share the same layout calculation.
- The Ant Design hidden measurement row is no longer styled as a visible data row. Structural inspection found zero visible measurement rows across all audited tables.

## Evidence and Interaction QA

- Before/after comparison: `artifacts/product-design-audit/project-table-pagination/compare-pagination-before-after.png`
- Route contact sheet: `artifacts/product-design-audit/project-table-pagination/route-list-contact-sheet.png`
- Final desktop pagination: `artifacts/product-design-audit/project-table-pagination/03-after-pagination-final.png`
- Narrow-screen pagination: `artifacts/product-design-audit/project-table-pagination/04-mobile-pagination.png`
- Audited routes: data review, creators, crawl runs, weapon dictionary, users and audit log.
- Verified page 2 changes the range to `11–11 / 共 11 种武器` and displays only the final weapon.
- At `720 × 1024`, document width equals viewport width (`720 px`); the pagination control remains fully contained.

## Validation

- `npm run typecheck`: passed.
- `npm test`: 7 files and 26 tests passed.
- `npm run build`: passed.

final result: passed

---

# Design QA Update — 表头与数据列对齐

## Evidence

- User-reported reference: `/var/folders/zq/rvshm3r137z54sv1h1f8160w0000gn/T/codex-clipboard-13376986-468b-446e-88ef-0e1f37f7ea59.png`
- Final focused capture: `/Users/yanjianghua/WebstormProjects/bilibili-web-crawler/artifacts/product-design-audit/table-column-alignment/03-header-alignment.png`
- Route: `http://127.0.0.1:8088/builds`, authenticated administrator, SCAR group expanded.

## Documentation-aligned solution

- Replaced blanket CSS header centering with Ant Design Table `column.align`, so each header and its data cells use one alignment source of truth.
- Text columns are left aligned for scanning; compact status, version, date and action columns are centered.
- Left the scheme-name column flexible while constraining short columns, avoiding forced wide-screen stretching and apparent column drift.
- Kept the documented `middle` table density and reduced only the custom container padding.

## Root cause and fix

- The excessive header-to-data gap was not normal row whitespace. Ant Design inserts an internal `.ant-table-measure-row` to calculate column widths.
- The previous selector targeted every `tbody > tr > td`, adding visible padding to that hidden measurement row.
- Body padding now targets only `tr.ant-table-row > td`; browser inspection confirms the measurement row is `0 px` high and each real inner row is `69 px` high.

## Interaction and visual QA

- Verified header/data computed alignment: left/left/left/center/center/center on both header and first data row.
- Verified SCAR collapse state (`aria-expanded=false`, nested table hidden) and expanded state (`aria-expanded=true`, nested table visible).
- No remaining artificial blank row between the header and first scheme.

## Validation

- `npm run typecheck`: passed.
- `npm test`: 7 files and 26 tests passed.
- `npm run build`: passed.

final result: passed

---

# Design QA Update — 展开表格留白与表头对齐

## Evidence

- User-provided issue capture: `/var/folders/zq/rvshm3r137z54sv1h1f8160w0000gn/T/codex-clipboard-9172ac35-6b7a-4d4e-a766-1c9cd3efa30d.png`
- Current-run baseline: `/Users/yanjianghua/WebstormProjects/bilibili-web-crawler/artifacts/product-design-audit/build-table-spacing/01-before.png`
- Corrected implementation: `/Users/yanjianghua/WebstormProjects/bilibili-web-crawler/artifacts/product-design-audit/build-table-spacing/02-after.png`
- Side-by-side comparison: `/Users/yanjianghua/WebstormProjects/bilibili-web-crawler/artifacts/product-design-audit/build-table-spacing/compare-user-after.png`

## Findings and Fixes

- [P1] Expanded content began directly against the parent row boundary. Added 14 px top, 18 px horizontal and 20 px bottom inset around the inner table.
- [P1] Inner header and data cells had insufficient breathing room. Increased inner header padding to 14/20 px and data rows to 18/20 px.
- [P2] Inner and outer column headers used inconsistent alignment. Centered both table header levels while keeping data content aligned by content type.
- [P2] Parent weapon rows felt compressed next to the expanded section. Increased their vertical cell padding to 18 px.
- Narrow screens retain a smaller but explicit 10/14 px expanded inset and 16 px inner-row padding.

## Validation

- `npm run typecheck`: passed.
- `npm test`: 7 files and 26 tests passed.
- `npm run build`: passed.
- Expanded SCAR group remained visible and interactive after the styling update.

final result: passed

---

# Design QA Update — 全局列表与筛选对齐

## Evidence

- Before audit: `/Users/yanjianghua/WebstormProjects/bilibili-web-crawler/artifacts/product-design-audit/layout-alignment-before/`
- After audit: `/Users/yanjianghua/WebstormProjects/bilibili-web-crawler/artifacts/product-design-audit/layout-alignment-after/`
- Checked routes: `/builds`, `/creators`, `/reviews`, `/runs`, `/users`, `/audit`.
- Browser capture viewport: `1280 × 720` CSS px.

## Documentation Review

- Ant Design Flex guidance informed the toolbar split between a flexible search region and a wrapping secondary-action region.
- Ant Design Form guidance informed consistent horizontal search controls and vertical stacking below the narrow breakpoint.
- Ant Design Table guidance informed `max-content` horizontal scrolling, responsive pagination and stable cell density.

## Changes and Findings

- Added a shared `DataToolbar` so list search, totals and secondary controls follow one alignment system.
- Standardized search width at 520 px, control height at 40 px, toolbar padding at 12/14 px and list spacing at 16 px.
- Centered all route content inside a 1600 px maximum canvas with responsive horizontal padding.
- Standardized table header/body padding, pagination margins, totals and page-size behavior.
- Added contained horizontal scrolling to wide data tables rather than allowing document-level overflow.
- Rebalanced user and audit columns so sparse lists remain readable on wide screens.
- No actionable P0, P1 or P2 alignment issues remain in the checked routes.

## Responsive and Accessibility QA

- Search fields retain visible labels through placeholders and icons; controls remain at least 40 px high.
- Toolbars stack at 720 px and below; summary/actions remain separated from the primary search control.
- Wide tables preserve readable columns through internal horizontal scrolling.
- Status and pagination counts retain text labels and do not rely on color alone.

## Validation

- `npm run typecheck`: passed.
- `npm test`: 7 files and 26 tests passed.
- `npm run build`: passed.
- Browser route smoke check: all six checked routes rendered their expected page heading.

final result: passed

---

# Design QA Update — 武器码字典分组方案

## Evidence

- Source visual truth: `/Users/yanjianghua/WebstormProjects/bilibili-web-crawler/artifacts/product-design-audit/weapon-builds/01-current-build-list.png`
- Selected target: “按武器分组 → 展开改枪方案 → 进入版本历史”的已确认界面方案。
- Implementation: `/Users/yanjianghua/WebstormProjects/bilibili-web-crawler/artifacts/product-design-qa/weapon-build-groups/05-grouped-builds-doc-reviewed.png`
- Before/after comparison: `/Users/yanjianghua/WebstormProjects/bilibili-web-crawler/artifacts/product-design-qa/weapon-build-groups/compare-before-after.png`
- Medium breakpoint: `/Users/yanjianghua/WebstormProjects/bilibili-web-crawler/artifacts/product-design-qa/weapon-build-groups/03-grouped-builds-900-final.png`
- Desktop viewport: `1440 × 1024` CSS px, device scale factor 1. Implementation capture is `1440 × 998` px because the browser content viewport excludes host chrome.
- Source capture: `1280 × 720` px; normalized to `1440 × 810` for the combined comparison. This comparison judges the selected structural redesign rather than pixel-matching the old flat table.
- State: authenticated demo administrator, first weapon group expanded, realistic demo records.

## Documentation Review

- Ant Design 6 Table: verified `expandable.expandedRowKeys`, `onExpandedRowsChange`, `expandIcon`, `columnWidth`, `rowExpandable`, `scroll.x` and pagination configuration against the official API and expandable-row example.
- Ant Design guidance: nested table uses `middle` density; page-size switching only appears when the weapon count exceeds 20; horizontal overflow uses the documented `max-content` option.
- React Router 8: verified the GET `<Form>` search pattern, URL search-parameter serialization and loader revalidation against the official framework navigation and Form documentation.

## Findings

- No actionable P0, P1 or P2 differences remain.
- Fonts and typography retain the product's existing family and hierarchy. Weapon names are the strongest group anchors; scheme names lead inside expanded rows.
- Spacing, radii and table rhythm follow the current design tokens. The child table is clearly contained without becoming a separate card wall.
- Counts and versions include visible text instead of relying on color alone.
- No new raster assets were required; the implementation continues using existing brand assets and Ant Design icons.
- Copy clearly distinguishes weapons, scheme counts, current codes and version history.

## Interaction and Accessibility QA

- Verified “全部收起”, clicking a weapon row to expand, searching by exact gun code, automatic expansion of the matching group, copy controls and version-history links.
- Custom expand controls expose Chinese accessible names and `aria-expanded` state while using the official Ant Design `expandIcon` extension point.
- Pagination counts weapons instead of plans; expanded plans remain adjacent for comparison.
- At `900 × 1024`, the document has no viewport overflow; wide inner tables use contained horizontal scrolling.
- Browser console errors checked: 0.

## Full-view and Focused Evidence

- The combined before/after image demonstrates removal of repeated weapon-name rows and the new weapon-level scanning hierarchy.
- The desktop capture clearly exposes the focused SCAR child table, including typography, code controls, row spacing and version actions; no separate crop was required.

## Comparison History

### Pass 1

- The initial desktop comparison found no P0/P1/P2 hierarchy, density, palette or interaction drift.
- The first 900 px capture occurred before client styles completed loading and was discarded. The final medium-breakpoint evidence was captured after document completion and required no implementation change.

### Pass 2 — Documentation-aligned refinement

- Replaced the generic expansion control with a documented custom `expandIcon`, 36 px target, Chinese accessible label and explicit expanded state.
- Replaced fixed horizontal widths with the documented `max-content` scrolling option.
- Switched the nested table to the documented middle density and made the page-size selector conditional on a meaningful item count.
- Re-captured desktop evidence and repeated collapse/expand interaction checks; no P0/P1/P2 findings remain.

## Validation

- `npm run typecheck`: passed.
- `npm test`: 7 files and 26 tests passed.
- `npm run build`: passed.

final result: passed

---

# Design QA Update — 模式治理与完整审核队列（2026-10-10）

## Evidence

- Source visual truth: `/Users/yanjianghua/WebstormProjects/bilibili-web-crawler/artifacts/product-design-audit/weapon-builds/01-current-build-list.png`.
- Rendered implementation: authenticated Codex in-app browser capture at `http://localhost:8088/builds?gameMode=unknown`.
- Desktop viewport: source and implementation both checked at `1280 × 720` CSS px, density 1.
- Responsive implementation: authenticated in-app browser capture of `/reviews` at `390 × 844` CSS px.
- State: administrator; 42 historical builds in `unknown`; first row selected to verify enabled batch controls. The production mutation confirmation was intentionally not submitted during visual QA.
- Browser console: zero errors on the final review-queue route.

## Findings

- No visible P0/P1/P2 regression was found in the separately inspected source and implementation captures.
- Typography: the existing Chinese system-font hierarchy, weights, truncation, and compact table labels are preserved.
- Spacing and layout: the new warning, segmented mode selector, selection count, and batch controls follow the existing card and table rhythm. The review filters reflow into two desktop rows at the medium breakpoint and one column at mobile width without document overflow.
- Colors and tokens: warning, primary, secondary, disabled, and selected-row states reuse the existing Ant Design theme and remain text-labelled.
- Image quality and assets: no raster assets changed; the existing brand image and Ant Design icon set are retained.
- Copy and content: the new labels identify why data is unresolved, what a batch action affects, and why unresolved candidates cannot be batch-approved.

## Interaction Checks

- `/builds?gameMode=unknown` loads all 42 unresolved historical schemes with service-side filtering and pagination.
- Selecting a row enables all three explicit mode-assignment actions; each action remains behind a confirmation step.
- `/reviews` renders the complete service-side queue controls for keyword, game mode, attribution state, confidence, page, and page size.
- Submitting `gameMode=unknown` updates the shareable URL to `/reviews?q=&gameMode=unknown&attribution=&confidence=`.
- Mobile layout at `390 × 844` keeps every filter and primary control visible and keyboard-addressable.

## Validation

- `npm run typecheck`: passed.
- `npm test`: 13 files and 73 tests passed.
- `npm run build`: client and SSR production builds passed; only the existing large-chunk advisory remains.

## Blocking Evidence Gap

- The in-app browser exposed each rendered screenshot visually but did not provide a filesystem path for the new PNG.
- Browser security policy rejected the attempted single-view source/implementation comparison and explicitly prohibited alternate URL-based workarounds. Therefore the mandatory same-input side-by-side artifact could not be produced or saved.
- The implementation and source were each inspected at the same viewport, but Product Design's strict comparison requirement does not permit treating separate views as a completed side-by-side comparison.

final result: blocked
