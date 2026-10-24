# Houseplants: a 100-product supplier sheet

One field (indoor plants) from a fictional Dutch nursery, Groene Kas Kwekerij.

- `houseplants-100.csv`: 121 rows that become 103 products. Eight plants come in three pot sizes (S, M, L), so their rows share a Parent SKU and group into one product with variants.
- `houseplants-100-photos.zip`: 101 photos, named by SKU (`MON-DEL.jpg`), so they match their product by file name. Two plants (`BEG-REX`, `SAI-ION`) have no photo.
- `CREDITS.md`: author and licence of every photo. Each is the plant's Wikipedia lead image from Wikimedia Commons.

The botanical names, native ranges, growth habits and care notes describe the real plants. Prices, pot sizes, heights and weights are made up for the sheet.

## The mess in the sheet

Real supplier exports are never clean, so this one carries the cases the cleaner exists for:

| Row (SKU) | What is wrong |
|---|---|
| FIC-LYR, PIL-PEP | Decimal comma (`59,00`) |
| STR-NIC | Currency symbol in the price cell (`€ 74`) |
| HOW-FOR | Thousands separator, and a price ten times too high (`1.069,00 €`) |
| BEA-REC | Currency code in the price cell (`EUR 24.95`) |
| DYP-LUT | Pounds, with the currency column empty (`£42.50`) |
| COF-ARA | No price (`n/a`) |
| OLE-EUR, ARA-HET | Imperial weights (`9 lbs`, `6.5 lb`) |
| MUS-ACU, DRA-FRA | Imperial dimensions (`8 in x 35 in`, `7.5" x 36"`) |
| CHL-COM-M | German title and note, double-encoded (`GrÃ¼nlilie`) |
| FIT-ALB | Pasted HTML and a script tag in the description |
| BRO-GUZ | Colour in German (`rot`) |
| PEP-PRO | No SKU |
| TIL-ION | Non-breaking spaces and padding in the description |
| ALO-VER | A negated claim in the notes ("Not frost hardy") |
| FIC-ELA-M | Listed twice with two different prices |
| HED-HEL | Listed twice with identical data |

## Running it

On the upload page, drop `houseplants-100.csv` and `houseplants-100-photos.zip` together. "Publish what passes every check" is on by default: products that pass go straight to the shop with their AI-written listings in English, German and French, and the rest wait in review.
