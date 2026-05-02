# Browser DAW

Browser DAW is the domain for arranging, editing, and playing audio projects collaboratively in the browser.

## Language

**Project**:
A collaborative workspace containing the tracks, clips, source audio, and mix settings for one audio production.
_Avoid_: Session, song, document

**Track**:
An ordered lane in a project that contains clips and has its own mix controls and effects.
_Avoid_: Channel, stem, layer

**Sample**:
Reusable source audio material in a project.
_Avoid_: Audio file, asset, media

**Sample frame**:
One discrete time step in digital audio, used for positions and durations.
_Avoid_: Sample when discussing DSP positions or counts

**Clip**:
A time-bounded placement of a sample on a track.
_Avoid_: Region, item, event

**Timeline**:
The time-based arrangement surface where clips are positioned across tracks.
_Avoid_: Canvas, sequencer, editor

**Playhead**:
The current playback position in the project timeline.
_Avoid_: Cursor, transport position

**Effect**:
A sound-processing unit applied to a track.
_Avoid_: Filter, plugin, processor

**Effect Chain**:
The ordered list of effects applied to a track.
_Avoid_: Effects list, rack, insert chain

**Mute**:
A track state that silences that track during playback.
_Avoid_: Disable, hide

**Solo**:
A track state that silences all tracks that are not also soloed.
_Avoid_: Isolate, focus

**Gain**:
A level adjustment applied to a track, clip, effect, or master track.
_Avoid_: Volume, loudness

**Pan**:
A stereo position adjustment for a track.
_Avoid_: Balance

**Project Member**:
A user with access to a project.
_Avoid_: Project user, participant, teammate

**Owner**:
A project member responsible for project administration.
_Avoid_: Admin

**Collaborator**:
A project member who can contribute to the project without owning it.
_Avoid_: Editor, contributor

**Master Track**:
The final track-like destination for the project mix.
_Avoid_: Master output, main, stereo bus

## Relationships

- A **Project** contains zero or more **Tracks**
- A **Project** contains zero or more **Samples**
- A **Project** has one or more **Project Members**
- A **Track** contains zero or more **Clips**
- A **Clip** references exactly one **Sample**
- A **Sample** can be referenced by many **Clips**
- A **Clip** occupies a time range on the **Timeline**
- **Clips** on the same **Track** must not overlap on the **Timeline**
- The **Playhead** points to one position on the **Timeline**
- A **Track** has zero or more **Effects**
- An **Effect Chain** belongs to exactly one **Track**
- Effects in an **Effect Chain** are applied in order
- **Mute** silences individual tracks during playback
- **Solo** silences all tracks except the soloed tracks during playback
- When any **Track** is soloed, solo selection determines audibility before mute selection
- A **Project Member** is either an **Owner** or a **Collaborator**
- All audible **Tracks** are mixed into the **Master Track**
- The **Master Track** can have mix controls such as **Gain**
- The **Master Track** may have an **Effect Chain**

## Example dialogue

> **Dev:** "If a user drags the same **Sample** onto two **Tracks**, did they duplicate the source audio?"
> **Domain expert:** "No. They created two **Clips** that reference the same **Sample**. Each **Clip** can have its own position, duration, and **Gain**."
>
> **Dev:** "Should clip positions be stored in seconds?"
> **Domain expert:** "Use **sample frames** for precise audio positions, but describe placement to users on the **Timeline**."

## Flagged ambiguities

- "sample" can mean reusable source audio material or one discrete DSP time step. Use **Sample** for source material and **sample frame** for DSP positions or counts.
- Historical code used `audioFile`/`audio_files` for what the domain calls **Sample**; new code should use **Sample** and **sample frame** names directly.
