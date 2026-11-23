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

## T-05 — Regions 1–2 diorama layers + hero sprites & portraits (2026-11-23)

Request: `nano_banana_pro`, resolution 2k, use_unlim false, medias `[{value: c05564d4-14be-4f28-b5a3-8cba21e153b4 (style bible), role: image_references}]`. Quote 2 cr/image. 10 images = **20 credits** (ticket cap 22). Jobs again report `nano_banana_2` (D-009).
Max 4 concurrent jobs per account: items 2 and 5 of the first batch were rejected (not charged) and resubmitted.
Full prompts: `docs/art/scripts/prompts.py` (style block + text below). Post-processing: `docs/art/scripts/` (key.mjs magenta chroma key + despill, build.mjs crops/exports, salvage5.mjs, contact.mjs). Contact sheet: `assets/raw/T-05_contact.jpg`.

| # | Output | Job ID | Result |
|---|---|---|---|
| 0 | `assets/regions/whisperpine/far.jpg` | `8627db7c-529e-4830-841e-ce6ae3310be7` | OK. Layered pine hills, fog, fireflies, warm horizon. Horizon is higher (~35%) than the 55% asked. |
| 1 | (rejected) whisperpine mid | `d92338c0-e7ec-4f20-95df-254e3c930c2f` | Off-brief: copied the style-bible composition (city, dunes, magenta sky). |
| 1b | `assets/regions/whisperpine/mid.png` | `facacf91-18dd-4877-a864-98b454b28d03` | OK after regen. A ghost row of faint trees in the top ~18% was cut (clearTop 0.185). The tree line fills about the lower 80%, not 60%. |
| 2 | `assets/regions/whisperpine/fg.png` | `7ebb7e62-2bc8-4869-a961-a0c706758900` | OK. Tree trunk at top-left, rocks and ferns at bottom-right, low fog wisps (soft alpha). |
| 3 | `assets/regions/glass_dunes/far.jpg` | `51ffb035-66f7-4656-9cc6-bc7b17ec31ad` | OK. Amber dunes, crystal spires, violet fog. |
| 4 | `assets/regions/glass_dunes/mid.png` | `d853a2cb-c5c6-4d95-a018-81331d349ad5` | OK. A stray floating crystal in the top-left was cut (clearTop 0.38). |
| 5 | (rejected) glass_dunes fg | `b6c56401-939d-4a15-9d2c-bacee70cdea5` | Off-brief: copied the style-bible scene. |
| 5b | `assets/regions/glass_dunes/fg.png` | `e2554f4c-6898-4921-8530-79afc97bda1c` | The regen ALSO copied the scene, and the at-most-once rule was used up. Salvaged for free: masked to the bottom corners and bottom strip with a piecewise boundary (salvage5.mjs), then keyed. Small dark sliver at the top-left of the left cluster. A candidate for later replacement. |
| 6 | hero sheet → `assets/raw/heroes/{bram,lysa,oren,kit}_sprite.png` | `b38cc065-5b75-4ad2-8532-ec4bb89ce6e3` | Strong. All four face right, same scale, locked looks match. Keyed and trimmed (~450-555 x 585-605 px). Oren's censer smoke puff is reddish-brown. |
| 7 | portrait sheet → `assets/heroes/{id}_portrait.jpg` 512² | `42d2780e-2eb9-45f7-af15-09a8e450caec` | Strong. Painterly, ember vignette, 4% inset crop per quadrant. |

### Prompt texts (after style block)
- 0: "Use the reference image only for art style. Wide side-on parallax backdrop layer of Whisperpine Woods at dusk: distant layered pine forest hills fading into blue-green fog, mossy valleys, faint fireflies, a far misty ridge. Horizon at about 55% down the frame. Top quarter is only a soft plain dusk gradient sky... No characters, no buildings... Deep greens and cold teal, subtle warm glow low on the horizon."
- 1/2/4/5 (first pass): "Use the reference image only for art style. Side-on parallax midground|foreground layer for <region>: <contents>, occupying only the lower 60% | only along the bottom edge and corners... No characters. The entire background is a perfectly flat, uniform pure magenta #FF00FF..."
- 3: as 0 for the Glass Dunes (amber dunes, crystal spires, heat haze, violet-blue fog, deeper dusk).
- 1b/5b (regen): added a 2nd reference (job d853a2cb, a clean magenta layer) plus "First reference image: art style only, do not copy its composition. Second reference image: copy its layout... Nothing else: no sky, no mountains, no city, no wagon, no characters..." This worked for 1b and failed for 5b.
- 6: "Character sprite sheet, 2x2 grid... side view facing RIGHT, idle battle stance... TL Bram knight steel plate, kite shield, sword; TR Lysa green hood, cloak, longbow; BL Oren crimson hooded robe, brass censer of embers; BR Kit light tan cloak, two short blades. No ground, no shadows, no grid lines. <magenta bg>"
- 7: "2x2 grid of four chest-up character portraits, 3/4 view, expressive faces, painterly HD-2D character art, dark warm vignette background lit by ember light, thin dark gap between quadrants... same order."

### Lessons
- With the style bible as the only reference, isolated layer prompts often reproduce the bible's whole scene (3 of 6 layer gens). For future layer or sprite gens, also pass a clean magenta-layer job (e.g. `d853a2cb...` or hero sheet `b38cc065...`) as a 2nd reference, and say "do not copy composition".
- Palette-quantized PNG (sharp `palette:true, quality 95`) keeps 1920-wide layers under 1 MB.

## T-08 — Regions 3–4 diorama layers, all enemies + bosses (2026-11-23)

Request: `nano_banana_pro`, 2k, use_unlim false, no folder. Quote 2 cr/image; 13 images = **26 credits** (ticket cap 30; balance 174 -> 148). Jobs report `nano_banana_2`. No regenerations were needed.
References (two per job, per T-05 lesson): style bible `c05564d4...` + a framing ref: far layers -> whisperpine far `8627db7c...`; mid -> glass_dunes mid `d853a2cb...`; fg -> whisperpine fg `7ebb7e62...`; sprites/bosses -> hero sheet `b38cc065...`. Prompt prefix after the style block: "First reference image: art style only, do not copy its composition. Second reference image: copy its layout and framing only." This stopped the bible-scene copying (0 of 13).
Full prompts: `docs/art/scripts/prompts_t08.py`. Build: `docs/art/scripts/build_t08.mjs` (run from the folder with the raw PNGs named by key, e.g. `fs_far.png`, `sheetA.png`, `hollow_king.png`; reuses `key.mjs`). Contact sheet: `docs/art/scripts/contact_t08.mjs` -> `assets/raw/T-08_contact.jpg`.

| Key | Output | Job ID | Result / post-fix |
|---|---|---|---|
| fs_far | `assets/regions/frostspire/far.jpg` | `3cd07de2-2e52-4e9d-bb5e-fb30124c80a2` | Strong: snowy peaks, aurora, frozen river. Horizon ~45%. A few warm lantern dots. Brightness x0.9. |
| fs_mid | `assets/regions/frostspire/mid.png` | `e05be77f-a728-457f-9e47-907be95960b1` | OK. Snowy pine line; opaque in the lower ~70% (includes a snowy clearing floor). |
| fs_fg | `assets/regions/frostspire/fg.png` | `2f282771-569a-48cc-860d-a8f1344ab058` | OK. Dead snowy tree TL, icy rocks + ferns BR. Magenta bled into fog: stricter key (lo 28/hi 130) + `unpink` recolor to cold blue-grey. |
| so_far | `assets/regions/solenne/far.jpg` | `43b3506e-75d6-457a-a12d-a736d0fd8a83` | Strong: domes, central gate with dim brazier (small flame), ash, near-night. Brightness x0.85. |
| so_mid | `assets/regions/solenne/mid.png` | `c76f83af-86ea-48d0-a430-e07e284d06ea` | OK. Ruined walls/towers. Darkened x0.7, sat 0.75, cooled (`cool`). |
| so_fg | `assets/regions/solenne/fg.png` | `53f15f59-725b-40d0-9e72-8059d4281a90` | Came out bright warm gold: darkened x0.42, sat 0.6, cooled. Still the warmest Solenne layer; renderer fog/tint can push it further. |
| sheetA | moss_wolf, thornling, wisp_lantern, barkhide_stag | `0228d6c2-56c0-416c-a803-06048b3ad2ed` | Strong, distinct colors. moss_wolf faced right -> flipped. Wisp is a carved gourd with blue spark. |
| sheetB | glass_scarab, dune_jackal, sand_wraith, prism_basilisk | `9b9da67c-b369-4e21-9d9e-702b642d3460` | Strong. scarab + jackal faced right -> flipped. |
| sheetC | frost_wight, ice_harpy, rime_golem, aurora_drake | `22c1c39c-8021-450c-aae1-12aef36e8c06` | Strong. frost_wight faced right -> flipped. Golem is front-facing. |
| rootmother | `assets/raw/enemies/rootmother_sprite.png` | `39fa265e-13ed-4410-ba6c-8adc28781bbe` | Strong; firefly crown, reaches left. |
| sunshard_colossus | `.../sunshard_colossus_sprite.png` | `3e2925e5-9ec3-48d4-b9b5-e9035397d794` | Strong; front-facing (no side view), molten core visible. |
| wintermaw | `.../wintermaw_sprite.png` | `a688b69d-4e09-4d41-b550-1659002ca60b` | Strong; faces left, open icy maw. Pink-tinted breath fixed with stricter key + `unpink`. |
| hollow_king | `.../hollow_king_sprite.png` | `26c6541e-4059-43ad-9123-0fe8836e7e33` | Strong; 3/4 left, glowing helm eyes, broken crown, smoke trails right. |

Sprites: quadrant crop -> magenta key -> trim -> flip if needed -> fit inside 900 px (nearest). All files < 0.7 MB. Sizes differ per sprite (trimmed); the renderer should scale by enemy `size`/tier, not raw pixels.

### Lessons
- Two-reference prompting ("art style only" + "layout and framing only") worked for all 13 gens. Keep using it.
- "facing LEFT" is ignored ~1 in 3 for quadrupeds/insects; flipping in code is free and fine.
- Fog/breath over magenta leaves pink semi-transparent pixels; use the stricter key + `unpink` pass for any layer with soft fog.
