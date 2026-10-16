// Plain-English explanations shown in "?" tooltips and on the Methodology page.
export const GLOSSARY = {
  identical:
    "Identical hazard: the later report raises the same specific risk, by the same mechanism, as the earlier one.",
  closely_related:
    "Closely related: the same specific risk, in a different setting or with a different emphasis.",
  confidence:
    "How sure the judge model was that the two concerns are the same hazard, from 0 to 1. Links below 0.70 are never shown. High is 0.85 or more.",
  lowest_confidence:
    "A chain is only as strong as its weakest link, so the chain shows the lowest confidence of any of its links.",
  no_response:
    "No response from this organisation to an earlier report was found on judiciary.uk. It may exist elsewhere, or may not have been published.",
  chain:
    "A chain is one hazard raised with one organisation in two or more reports, at least six months apart.",
  verified:
    "Every quote shown was checked by code to appear word for word in the original report.",
  after_promise:
    "The later report came after the organisation's response stated an action. It shows the concern was raised again, not why.",
  scores:
    "TF-IDF compares shared words. Embedding compares meaning. Judge is the Nemotron Super verdict that decides whether a link is shown.",
} as const;
