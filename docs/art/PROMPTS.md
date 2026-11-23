# Higgsfield Prompt Log

Style block (prepended to every prompt, from CLAUDE.md):
> HD-2D pixel art, Octopath Traveler style, crisp pixel sprites, painterly diorama background, tilt-shift miniature depth, dramatic warm ember light against cold dusk, volumetric fog, high fantasy, no text, no watermark, no UI

## T-03 — Title key-art candidates (2026-11-23)

Request: model `nano_banana_pro`, aspect 16:9, resolution 2k, use_unlim false, no folder_id. One `generate_image_batch` call.
Quote: 2 credits/image; actual 6 total (balance 200 -> 194).
Note: jobs_wait reported the job model as `nano_banana_2` although `nano_banana_pro` was requested. Quoted price was charged.
Raw output: 2752x1536 PNG (4.5-8 MB). Saved to repo as 1920x1072 JPEG q92 (<0.5 MB each) to meet the 2 MB cap.

| Cand | File | Job ID | Composition |
|---|---|---|---|
| A | `assets/key_art/candidate_a.jpg` | `0c0177fb-a34a-489d-9c75-6eb8d816db90` | Side-on diorama of road |
| B | `assets/key_art/candidate_b.jpg` | `c05564d4-14be-4f28-b5a3-8cba21e153b4` | High 3/4 view, woods-to-dunes |
| C | `assets/key_art/candidate_c.jpg` | `d039094e-910d-46c1-8386-c546cefc5f7a` | Low close angle on lantern-wagon, heroes silhouetted |

Use the chosen candidate's job id as the style-bible `image_reference` (medias value).

### Observations
- A: strongest sprite clarity and Octopath read; heroes and wagon match brief well; brazier clearly visible; large calm sky for logo. Wagon has no draft animal.
- B: richest world (woods -> glass dunes -> golden city with lit brazier); best fit for "journey" theme; sky space for logo in upper-middle; scene is busier and less dusky than A/C; wagon pulled by an ox.
- C: most atmospheric and intimate; heroes silhouetted, old woman foreground; wagon is a handcart; brazier reads as a small campfire, not giant.

### Prompt A
<style block>. Side-on diorama of a winding road: a caravan of four heroes (armored warden with tower shield, hooded ranger with bow, robed ember priest with swinging censer, nimble duelist with twin blades) walking beside an old woman driving a small wooden lantern-wagon whose lantern holds a glowing living flame. The road runs right-to-left through a darkening fantasy world toward a distant ruined golden city with a giant dim brazier on the horizon. Warm ember glow around the wagon against cold blue dusk. Calm empty sky in the upper-middle of the frame for a title logo.

### Prompt B
<style block>. High three-quarter view over a vast landscape transitioning from deep green Whisperpine woods with fireflies and moss into amber glass dunes with crystal spires. A tiny caravan on a winding road: four heroes (armored warden with tower shield, hooded ranger with bow, robed ember priest with censer, nimble duelist with twin blades) and an old woman driving a small wooden lantern-wagon carrying a glowing living flame, the only warm light in the scene. Far away, a ruined golden city with a giant dim brazier. Cold blue dusk sky with calm open space in the upper-middle for a title logo.

### Prompt C
<style block>. Close low-angle shot on a small wooden lantern-wagon whose lantern holds a glowing living flame with a hint of a face, an old woman wagon driver holding the reins lit warmly by it. Behind and around, four heroes stand silhouetted against cold blue dusk: armored warden with tower shield, hooded ranger with bow, robed ember priest with censer, nimble duelist with twin blades. A winding road leads into the distance toward a ruined golden city with a giant dim brazier. Calm dusky sky in the upper-middle left open for a title logo.
