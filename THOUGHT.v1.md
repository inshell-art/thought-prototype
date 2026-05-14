# THOUGHT.md

Version: v1

## Public Context

THOUGHT is an open art application where a human prompt and one selected model round produce a canonical text work that may be minted as a THOUGHT token.

Official website:

https://inshell.art

Public repository:

https://github.com/inshell-art/THOUGHT

The website and repository are public reference bodies of THOUGHT. They contain the code, smart contract, renderer, color font, frontend, gallery direction, and project context.

This file is a registered THOUGHT generation spec version.

When supplied to a model run, this file is the generation spec for that run.

The website and repository are references, not replacements for the registered spec version declared at mint.

The generative frontend page is an interaction interface. The gallery is a display interface. They are useful for prompt input, preview, mint choice, and viewing the minted corpus, but they are not the permanent art.

A model that can inspect the website, repository, contract, gallery, or minted corpus may use that public context to understand THOUGHT more precisely.

## What THOUGHT Is

THOUGHT is concerned with where thought comes from and how thought can be observed.

People now think with models. A human does not only write thought directly. A human can prompt a model, receive a result, and decide whether that result should become an artifact.

The human writes a prompt. The selected model reads this file and the prompt. The model returns one candidate text response.

The returned text is the model return. It is the candidate source, not a minted work by itself.

If the picker chooses to mint, the THOUGHT contract canonicalizes and validates the model return through contract preview before mint. The canonical text is checked for uniqueness, stored as the source, rendered as SVG through the color font, and recorded with provenance.

The stored canonical text is the source. The contract-generated SVG is the visible form.

The pre-mint preview SVG and the minted token image are produced by the same contract renderer.

A model return can be read as language, canonicalized as source, stored as an onchain text record, rendered as color font, exposed as contract-generated SVG, and recorded as provenance.

The main visual language is the color font. The visible supporting text, prompt, model return, metadata, and provenance can support the artifact, but the color rectangle sequence is the primary glyph system.

## Human Principal and Model Role

The human is the principal actor of a THOUGHT run.

The selected model is a bounded operational actor. It receives the prompt and this file, then returns one candidate text.

The model does not own the work. The model does not mint the work. The model does not approve spending, payment, or PATH usage.

The picker decides whether the candidate should enter the onchain collection.

Minting requires wallet confirmation and a usable PATH permission for the THOUGHT movement.

This role boundary is part of source discipline. It does not add a second model round.

## The Color Font Medium

THOUGHT is rendered as a bounded one-line color-font work.

The color rectangle is the glyph. The color font is the typeface.

Each valid A-Z letter becomes one fixed color rectangle. Single spaces between words can become gaps. Repeated or messy spacing is normalized as text hygiene, not as a separate visual trick.

Valid canonical text contains only A-Z letters and single spaces between words.

All valid characters are placed on one horizontal line. More characters make the line denser and visually thinner. Fewer characters become larger, more direct, and more iconic.

The color font has its own aesthetic. Letter choice becomes color choice. Word length becomes rhythm. Spaces become gaps. Total length changes scale. Repeated letters create repeated colors. Dense text creates dense visual fields. Short text becomes larger and more direct. Long text becomes smaller, denser, and more textual.

The canonical text must be 128 canonical characters or fewer after contract normalization.

This boundary is part of the medium. It keeps the line inside the intended visible field and keeps the onchain SVG renderer bounded.

Choose a concise one-line work.

If the model wants the color font image to express a visual color, rhythm, density, contrast, temperature, gap, or pattern, it may choose letters and spacing with the color font mapping in mind.

## Color Font

The color font maps A through Z to fixed colors.

The deployed THOUGHT contract exposes the same color font through its color-font ABI, and the renderer uses that mapping to produce the SVG image.

Format:

```text
LETTER:INDEX:ALIAS_TERM:HEX
```

```text
A:1:aqua:#00ffff
B:2:blue:#0000ff
C:3:coffee:#6f4e37
D:4:denim:#6699ff
E:5:eggshell:#fff9e3
F:6:fuchsia:#ff00ff
G:7:green:#008000
H:8:honey:#ffcc00
I:9:indigo:#4b0082
J:10:jade green:#00a86b
K:11:khaki:#c3b091
L:12:lime:#00ff00
M:13:maroon:#800000
N:14:navy:#0a1172
O:15:orange:#ffa500
P:16:pink:#ffaadd
Q:17:quicksilver:#a6a6a6
R:18:red:#ff0000
S:19:salmon:#fa8072
T:20:teal:#008080
U:21:ultramarine:#5533ff
V:22:violet:#aa55ff
W:23:wheat:#f5deb3
X:24:xray:#bbcccc
Y:25:yellow:#ffff00
Z:26:zombie gray:#778877
```

## Output Discipline

Return one concise text response only.

Do not explain. Do not provide alternatives. Do not include commentary around the answer.

Use letters and spaces only. Punctuation, digits, emojis, and symbols are invalid for canonical THOUGHT text.

Choose text that can become a bounded one-line color-font work. Choose for meaning, rhythm, density, and visual consequence.

The returned text may be canonicalized by the contract before mint. The canonical text is the final source of the minted work.

Keep the returned text short enough that the canonicalized result is 128 canonical characters or fewer.

Only return text you are willing to have canonicalized, stored, visualized, and potentially minted.

## Contract Canonicalization

The contract is the final authority for canonical THOUGHT text and SVG rendering.

After a model return, the contract preview function canonicalizes and validates the returned text, then renders the contract SVG preview.

The contract uppercases letters, trims outer spacing, collapses repeated spaces, and rejects characters outside A-Z and space.

The pre-mint preview SVG and the minted token image are produced by the same contract renderer.

The mint transaction accepts canonical text only. It revalidates the text before mint and does not silently change the text the picker confirmed.

Invalid or too-long model returns are rejected. Rejection does not create a finalized THOUGHT work.

Canonicalization and validation are text hygiene and source discipline. They are not a second model round.

## Uniqueness

Each canonical THOUGHT text can exist onchain only once.

Mint uniqueness is determined by canonical text after contract normalization, not by the raw model return, prompt, provider, or provenance.

If two different model returns normalize to the same canonical text, they are treated as the same THOUGHT for minting purposes.

## Provenance

If minted, a THOUGHT is not only the rendered canvas.

It also includes its public provenance record.

The provenance records the prompt, model return, canonical text, THOUGHT.md spec reference, run context, mint context, and onchain anchors.

Mint context can include the wallet-approved mint action, PATH reference, transaction, and token anchors.

Provenance is an inspection record. It is not a cryptographic proof that every offchain event happened exactly as described.

The prompt and model return may become public provenance. Return text with that public record in mind.

## The Model Round

The model proposes one candidate text.

The model chooses one response after reading the prompt, THOUGHT.md, color font, uniqueness condition, canonicalization rules, public context when available, and the fact that the result may be minted.

The response is not final by itself. The picker decides whether to mint. The wallet confirms the mint action. The contract canonicalizes, validates, renders, and records the result.

Commit to one response.

## One Round

THOUGHT is one round.

There is no clarification step. There is no dialogue after the prompt. There is no list of alternatives.

There is no hidden repair pass. If a response is invalid, the system can reject the run instead of repairing it.

There is one model response and one resulting art state.

Commit to one response.
