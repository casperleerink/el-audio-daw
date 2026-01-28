# PRD: UX Polish Improvements

## Overview

Improve user experience across the el-audio-daw application with focus on loading states, feedback, form polish, editor interactions, and audio engine initialization. These are small, targeted improvements to make the app feel more polished and responsive.

**Problem:** The app lacks visual feedback during async operations, has an awkward audio initialization flow, and could benefit from smoother editor interactions.

**Solution:** Add loading states, improve form handling, auto-initialize audio on first interaction, and polish editor UX.

## Goals

- Provide clear visual feedback for all async operations
- Eliminate "Start Audio" button friction with auto-initialization
- Make forms feel responsive with proper submit states
- Improve editor interactions (timeline, track controls)
- Reduce user confusion through consistent feedback patterns

## List of Tasks

### Loading & Feedback States

- [x] **Add loading spinner to project creation button** - Disable button and show spinner while creating project
  - Acceptance: Button shows spinner icon, is disabled during mutation, re-enables on complete/error

- [x] **Add loading states to track operations** - Show feedback when adding, deleting, reordering tracks
  - Acceptance: Add track button shows spinner while creating; delete shows brief disabled state; reorder shows drop animation

- [x] **Add loading overlay during project load** - Show skeleton or spinner while project data loads
  - Acceptance: Editor page shows loading skeleton until project and tracks queries resolve

- [x] **Add optimistic updates for track mute/solo/gain** - Instant UI feedback before server confirms
  - Acceptance: Clicking mute/solo instantly toggles visual state; gain slider moves instantly; rolls back on error

- [ ] **Show saving indicator for project name changes** - Indicate when project name is being saved
  - Acceptance: Settings dialog shows "Saving..." text or spinner next to save button while mutation runs

### Form & Input Polish

- [ ] **Disable auth form submit buttons during submission** - Prevent double-submit on sign-in/sign-up
  - Acceptance: Submit button disabled + shows spinner while auth request in flight

- [ ] **Add form-level error display for auth forms** - Show auth errors prominently above form
  - Acceptance: Failed login shows error message above form fields, not just toast

- [ ] **Improve inline track name editing** - Better visual affordance for editable names
  - Acceptance: Track name shows subtle edit icon on hover; focused state has visible border; escape cancels edit

- [ ] **Add character limit feedback for inputs** - Show remaining characters for project/track names
  - Acceptance: Project name input shows "X/50 characters" counter when near limit

### Audio Engine Auto-Initialization

- [x] **Remove explicit "Start Audio" button** - Initialize audio on first transport action
  - Acceptance: No "Start Audio" button visible; audio initializes when user clicks play or interacts with timeline

- [x] **Add audio initialization loading state** - Show brief loading when audio engine starts
  - Acceptance: Play button shows spinner for first click while audio context initializes

- [x] **Handle audio initialization failure gracefully** - Show user-friendly error if audio fails
  - Acceptance: If AudioContext fails, show toast with "Audio not available" message + retry button

### Editor Interactions

- [ ] **Improve drag-drop visual feedback** - Clearer drop zone indicators when reordering tracks
  - Acceptance: Drop target shows highlighted background (not just thin line); dragged item has shadow/opacity

- [ ] **Add hover states to timeline** - Show time position on mouse hover
  - Acceptance: Hovering timeline shows vertical line + tooltip with time at cursor position

- [ ] **Improve zoom controls** - Add visible zoom in/out buttons alongside scroll-zoom
  - Acceptance: Timeline header has +/- buttons; clicking zooms in/out by 2x; scroll-zoom still works

- [ ] **Add keyboard shortcut hints** - Show shortcut hints in tooltips
  - Acceptance: Transport buttons show tooltips with shortcuts (e.g., "Play (Space)"); tooltips appear on hover

- [ ] **Prevent browser zoom on timeline pinch gesture** - Block default browser zoom when using trackpad pinch in timeline
  - Acceptance: Pinch-to-zoom on trackpad only affects timeline zoom level, not browser zoom; works on Chrome, Safari, Firefox

- [x] **Disable overscroll globally** - Prevent rubber-band/bounce effects that interfere with panning
  - Acceptance: No overscroll bounce on any scroll container; horizontal/vertical panning stops at boundaries without elastic effect

### Quick Wins

- [ ] **Add focus ring to all interactive elements** - Visible focus for keyboard navigation
  - Acceptance: Tab through UI shows clear focus ring on buttons, inputs, sliders. But double check that this doesn't already exist in the underlying ui component

- [ ] **Improve empty state for new projects** - Better messaging when no tracks exist
  - Acceptance: Empty editor shows "No tracks yet" message with prominent "Add Track" button

- [ ] **Add toast for successful actions** - Confirm track add/delete completed
  - Acceptance: Adding track shows brief success toast; deleting track shows "Track deleted" toast

## Functional Requirements

**FR-1:** Loading states must appear within 100ms of action start and disappear within 100ms of completion.

**FR-2:** Optimistic updates must revert within 500ms if server mutation fails, showing error toast.

**FR-3:** Audio engine must initialize on first play/seek action, not require separate button.

**FR-4:** All interactive elements must have visible focus indicators meeting WCAG 2.1 AA contrast.

**FR-5:** Keyboard shortcuts must work when focus is anywhere in editor (except text inputs).

**FR-6:** Form submissions must be debounced to prevent double-submit (disable button during request).

**FR-7:** Tooltips must appear after 500ms hover delay and show within viewport bounds.

## Non-Goals

- Adding new features (audio clips, effects, recording)
- Accessibility overhaul (screen reader support, ARIA labels) - separate PRD
- Error boundary implementation - separate PRD
- Performance optimization - separate PRD
- Testing infrastructure - separate PRD
- Confirmation dialogs for delete actions - not selected for this phase

## Design & Technical Considerations

**Tech stack constraints:**

- Use existing Tailwind classes for styling consistency
- Use Lucide icons (already in project) for loading spinners
- Use Sonner (already installed) for toast notifications
- Use Base UI Dialog for any modals

**Animation approach:**

- Prefer CSS transitions over JavaScript animations
- Use `transition-all duration-150` for micro-interactions
- Use `transition-transform` for playhead to enable GPU acceleration

**Audio initialization:**

- Initialize AudioContext on first user gesture (play, seek, track add)
- Store initialization promise to prevent multiple init attempts
- Show loading state only on first interaction

**State management:**

- Use React state for optimistic updates
- Sync with Convex query results after mutation completes
- Handle race conditions with request IDs or timestamps

**Scroll/zoom behavior:**

- Add `overscroll-behavior: none` to html/body in global CSS
- Use `touch-action: none` on timeline canvas to prevent browser gestures
- Call `e.preventDefault()` on wheel events with ctrlKey/metaKey to block browser zoom
- Consider using `gesturestart`/`gesturechange` events for Safari pinch detection

## Success Metrics

- All async operations show loading feedback
- No "Start Audio" button visible in UI
- Forms cannot be double-submitted
- Keyboard focus visible on all interactive elements
- Editor feels responsive (no visible lag during interactions)

## Open Questions

1. Should optimistic updates apply to track gain slider (continuous value) or only discrete actions (mute/solo)?
2. What's the preferred tooltip library - use Base UI Tooltip or simple CSS tooltips?
3. Should zoom buttons show current zoom level percentage?
