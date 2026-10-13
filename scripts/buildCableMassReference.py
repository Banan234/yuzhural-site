"""Build a source-backed cable mass reference from manufacturer tables.

Install pypdf and beautifulsoup4 before running. The source PDFs are downloaded
to a temporary cache outside the repository; only validated rows are written.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import json
import re
import subprocess
import tempfile
from collections import Counter
from datetime import date
from pathlib import Path
from urllib.parse import urljoin

from bs4 import BeautifulSoup
from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "cableMassReference.json"
CACHE = Path(tempfile.gettempdir()) / "yuzhural-cable-mass-sources"

SOURCES = {
    "hka": {
        "publisher": "Холдинг Кабельный Альянс",
        "title": "Общий каталог «Кабели и провода»",
        "url": "https://uralcable.ru/upload/iblock/736/ha0jwhn9l48g4zbglkp9mlxn61juko6o/1_KHKA_obshchiy_katalog.pdf",
        "kind": "manufacturer_catalog_pdf",
    },
    "uncomtech": {
        "publisher": "Ункомтех",
        "title": "Каталог продукции, том 2",
        "url": "https://www.uncomtech.ru/download/366",
        "kind": "manufacturer_catalog_pdf",
    },
    "energokab": {
        "publisher": "Завод Энергокабель",
        "title": "ВВГнг(А)-LS: технические характеристики",
        "url": "https://www.energokab.ru/katalog/silovye-kabeli-3kv/ng-ls/marki-vvgnga-ls-avvgnga-ls-vvgenga-ls-avvgenga-ls-vbshvnga-ls-avbshvnga-ls-po-tu-16k71-310-2001/vvgnga-ls/",
        "kind": "manufacturer_product_page",
    },
    "energokab_avvg": {
        "publisher": "Завод Энергокабель",
        "title": "АВВГнг(А)-LS: технические характеристики",
        "url": "https://www.energokab.ru/katalog/silovye-kabeli-3kv/ng-ls/marki-vvgnga-ls-avvgnga-ls-vvgenga-ls-avvgenga-ls-vbshvnga-ls-avbshvnga-ls-po-tu-16k71-310-2001/avvgnga-ls/",
        "kind": "manufacturer_product_page",
    },
    "energokab_vbsh": {
        "publisher": "Завод Энергокабель",
        "title": "ВБШвнг(А)-LS: технические характеристики",
        "url": "https://www.energokab.ru/katalog/silovye-kabeli-3kv/ng-ls/marki-vvgnga-ls-avvgnga-ls-vvgenga-ls-avvgenga-ls-vbshvnga-ls-avbshvnga-ls-po-tu-16k71-310-2001/vbsh-vnga-ls/",
        "kind": "manufacturer_product_page",
    },
    "energokab_pvs": {
        "publisher": "Завод Энергокабель",
        "title": "ПВС: технические характеристики",
        "url": "https://www.energokab.ru/katalog/provoda-i-shnury/marki-pvs-pvsn-po-gost-7399-97/pvs/",
        "kind": "manufacturer_product_page",
    },
    "paritet": {
        "publisher": "ТПД Паритет / НИЦ Кабельные технологии",
        "title": "Каталог кабельно-проводниковой продукции для подвижного состава",
        "url": "https://paritet.su/upload/catalog_transcab.pdf",
        "kind": "manufacturer_catalog_pdf",
    },
    "samaracable": {
        "publisher": "Самарская кабельная компания",
        "title": "Каталог кабельно-проводниковой продукции",
        "url": "https://www.samaracable.ru/upload/catalog.pdf",
        "kind": "manufacturer_catalog_pdf",
    },
    "gerda_table": {
        "publisher": "ГЕРДА",
        "title": "Таблица наружных диаметров и расчётной массы ГЕРДА-КВ и ГЕРДА-КВК",
        "url": "https://kazkabel.kz/wp-content/uploads/kek/2025/03/tablica-diametrov-gerda-kv-gerda-kvk.pdf",
        "kind": "manufacturer_reference_pdf",
    },
    "gerda_kuin": {
        "publisher": "ГЕРДА",
        "title": "Таблица наружных диаметров и расчётной массы КУИН парной скрутки",
        "url": "https://kazkabel.kz/wp-content/uploads/kek/2025/03/tablica-diametrov-kuin-x2x-x3x-x4x-skr-redakciya-2018-08.pdf",
        "kind": "manufacturer_reference_pdf",
    },
}

# Each product page has its own source ID so the calculator links to the
# precise table, even when several marks come from the same manufacturer.
ENERGOKAB_ADDITIONAL_PAGES = [
    ("energokab_vvg", "ВВГ", "silovye-kabeli-3kv/dlja-odinochnoj-prokladki/tu-16-705-499-2010/vvg/", 1, True, False),
    ("energokab_avvg_plain", "АВВГ", "silovye-kabeli-3kv/dlja-odinochnoj-prokladki/tu-16-705-499-2010/avvg/", 3, True, False),
    ("energokab_vbshv", "ВБШв", "silovye-kabeli-3kv/dlja-odinochnoj-prokladki/tu-16-705-499-2010/vbshv/", 3, True, False),
    ("energokab_vbbshv", "ВБбШв", "silovye-kabeli-3kv/dlja-odinochnoj-prokladki/gost-16442-80/vbbshv/", 3, True, False),
    ("energokab_avbshv", "АВБШв", "silovye-kabeli-3kv/dlja-odinochnoj-prokladki/tu-16-705-499-2010/avbshv/", 3, True, False),
    ("energokab_pugv", "ПуГВ", "provoda-i-kabeli-dlja-elektricheskih-ustanovok/marki-puv-pugv-puvv-pugvv-kuvv-kugvv-po-tu-16-705501-2010/pugv/", 1, False, False),
    ("energokab_pugvv", "ПуГВВ", "provoda-i-kabeli-dlja-elektricheskih-ustanovok/marki-puv-pugv-puvv-pugvv-kuvv-kugvv-po-tu-16-705501-2010/pugvv/", 1, False, False),
    ("energokab_puv", "ПуВ", "provoda-i-kabeli-dlja-elektricheskih-ustanovok/marki-puv-pugv-puvv-pugvv-kuvv-kugvv-po-tu-16-705501-2010/puv/", 1, False, False),
    ("energokab_pv1", "ПВ1", "provoda-i-kabeli-dlja-elektricheskih-ustanovok/marki-pv1-pv1-xl-pv2-pv2-xl-pv3-pv3-xl-pv4-pv4-xl-ppv-ppv-xl-apv-apv-xl-appv-appv-xl-po-gost-6323-79/pv1/", 1, False, True),
    ("energokab_pv3", "ПВ3", "provoda-i-kabeli-dlja-elektricheskih-ustanovok/marki-pv1-pv1-xl-pv2-pv2-xl-pv3-pv3-xl-pv4-pv4-xl-ppv-ppv-xl-apv-apv-xl-appv-appv-xl-po-gost-6323-79/pv3/", 1, False, True),
    ("energokab_kvvg", "КВВГ", "kontrolnye-kabeli/kabeli-kontrolnyie-dlya-odinochnoj-prokladki/marki-kvvg-kvvgz-kvvge-kvbbshv-po-gost-1508-78/kvvg/", 1, False, False),
    ("energokab_kvbbshv", "КВБбШв", "kontrolnye-kabeli/kabeli-kontrolnyie-dlya-odinochnoj-prokladki/marki-kvvg-kvvgz-kvvge-kvbbshv-po-gost-1508-78/kvbbshv/", 1, False, False),
    ("energokab_vvgng", "ВВГнг(А)", "silovye-kabeli-3kv/ng/marki-vvgnga-avvgnga-vvgenga-avvgenga-vbshvnga-avbshvnga-po-tu-16-705499-2010/vvgnga/", 3, True, False),
    ("energokab_avvgng", "АВВГнг(А)", "silovye-kabeli-3kv/ng/marki-vvgnga-avvgnga-vvgenga-avvgenga-vbshvnga-avbshvnga-po-tu-16-705499-2010/avvgnga/", 3, True, False),
    ("energokab_vbshvng", "ВБШвнг(А)", "silovye-kabeli-3kv/ng/marki-vvgnga-avvgnga-vvgenga-avvgenga-vbshvnga-avbshvnga-po-tu-16-705499-2010/vbsh-vnga/", 3, True, False),
    ("energokab_avbshvng", "АВБШвнг(А)", "silovye-kabeli-3kv/ng/marki-vvgnga-avvgnga-vvgenga-avvgenga-vbshvnga-avbshvnga-po-tu-16-705499-2010/avbsh-vnga/", 3, True, False),
    ("energokab_kvvgngls", "КВВГнг(А)-LS", "kontrolnye-kabeli/kabeli-kontrolnyie-ne-rasprostranyayushhie-gorenie-pri-gruppovoj-prokladke-s-ponizhennyim-dyimo-i-gazovyideleniem-ispolnenie-ng-ls/marki-kvvgnga-ls-kvvgenga-ls-po-tu-16k71-310-2001/kvvgnga-ls/", 1, False, False),
    ("energokab_kvvgfrls", "КВВГнг(А)-FRLS", "kontrolnye-kabeli/kabeli-kontrolnye-ognestoykie-ne-rasprostranyayushchie-gorenie-pri-gruppovoy-prokladke-s-ponizhennym/marki-kvvgnga-frls-kvvgenga-frls-po-tu-16k71-337-2004/kvvgnga-frls/", 1, False, False),
    ("energokab_kvvgz", "КВВГз", "kontrolnye-kabeli/kabeli-kontrolnyie-dlya-odinochnoj-prokladki/marki-kvvg-kvvgz-kvvge-kvbbshv-po-gost-1508-78/kvvgz/", 1, False, False),
    ("energokab_kvvge", "КВВГЭ", "kontrolnye-kabeli/kabeli-kontrolnyie-dlya-odinochnoj-prokladki/marki-kvvg-kvvgz-kvvge-kvbbshv-po-gost-1508-78/kvvge/", 1, False, False),
    ("energokab_pvsn", "ПВСн", "provoda-i-shnury/marki-pvs-pvsn-po-gost-7399-97/pvsn/", 1, False, False),
    ("energokab_apv", "АПВ", "provoda-i-kabeli-dlja-elektricheskih-ustanovok/marki-pv1-pv1-xl-pv2-pv2-xl-pv3-pv3-xl-pv4-pv4-xl-ppv-ppv-xl-apv-apv-xl-appv-appv-xl-po-gost-6323-79/apv/", 1, False, True),
    ("energokab_pv2", "ПВ2", "provoda-i-kabeli-dlja-elektricheskih-ustanovok/marki-pv1-pv1-xl-pv2-pv2-xl-pv3-pv3-xl-pv4-pv4-xl-ppv-ppv-xl-apv-apv-xl-appv-appv-xl-po-gost-6323-79/pv2/", 1, False, True),
    ("energokab_pv4", "ПВ4", "provoda-i-kabeli-dlja-elektricheskih-ustanovok/marki-pv1-pv1-xl-pv2-pv2-xl-pv3-pv3-xl-pv4-pv4-xl-ppv-ppv-xl-apv-apv-xl-appv-appv-xl-po-gost-6323-79/pv4/", 1, False, True),
    ("energokab_vvgengls", "ВВГЭнг(А)-LS", "silovye-kabeli-3kv/ng-ls/marki-vvgnga-ls-avvgnga-ls-vvgenga-ls-avvgenga-ls-vbshvnga-ls-avbshvnga-ls-po-tu-16k71-310-2001/vvge-nga-ls/", 3, True, False),
    ("energokab_avvgengls", "АВВГЭнг(А)-LS", "silovye-kabeli-3kv/ng-ls/marki-vvgnga-ls-avvgnga-ls-vvgenga-ls-avvgenga-ls-vbshvnga-ls-avbshvnga-ls-po-tu-16k71-310-2001/avvge-nga-ls/", 3, True, False),
    ("energokab_vbshvfrls", "ВБШвнг(А)-FRLS", "silovye-kabeli-3kv/ng-frls/marki-vvgnga-frls-vvgenga-frls-vbshvnga-frls-vvg-pnga-frls-po-tu-16k121-022-2011/vbsh-vnga-frls-fe180/", 3, True, False),
    ("energokab_kvvgengls", "КВВГЭнг(А)-LS", "kontrolnye-kabeli/kabeli-kontrolnyie-ne-rasprostranyayushhie-gorenie-pri-gruppovoj-prokladke-s-ponizhennyim-dyimo-i-gazovyideleniem-ispolnenie-ng-ls/marki-kvvgnga-ls-kvvgenga-ls-po-tu-16k71-310-2001/kvvge-nga-ls/", 1, False, False),
    ("energokab_ppgnghf", "ППГнг(А)-HF", "silovye-kabeli-3kv/ng-hf/marka-2/ppgnga-hf/", 1, True, False),
    ("energokab_vvgfrls", "ВВГнг(А)-FRLS", "silovye-kabeli-3kv/ng-frls/marki-vvgnga-frls-vvgenga-frls-vbshvnga-frls-vvg-pnga-frls-po-tu-16k121-022-2011/vvgnga-frls-fe180/", 3, True, False),
]

for source_id, mark, relative_url, *_ in ENERGOKAB_ADDITIONAL_PAGES:
    SOURCES[source_id] = {
        "publisher": "Завод Энергокабель",
        "title": f"{mark}: технические характеристики",
        "url": f"https://www.energokab.ru/katalog/{relative_url}",
        "kind": "manufacturer_product_page",
    }

KPS_FRLS_PAGES = [
    ("energokab_kpsfrls", "КПСнг(А)-FRLS", "kpsnga-frls"),
    ("energokab_kpsgfrls", "КПСГнг(А)-FRLS", "kpsgnga-frls"),
    ("energokab_kpsefrls", "КПСЭнг(А)-FRLS", "kpsenga-frls"),
    ("energokab_kpsegfrls", "КПСЭГнг(А)-FRLS", "kpsegnga-frls"),
]
for source_id, mark, slug in KPS_FRLS_PAGES:
    SOURCES[source_id] = {
        "publisher": "Завод Энергокабель",
        "title": f"{mark}: технические характеристики",
        "url": (
            "https://www.energokab.ru/katalog/kabel-dlja-sistem-pozharnoj-signalizacii/"
            "marki-kpsnga-frls-kpsgnga-frls-kpsenga-frls-kpsegnga-frls-kpseenga-frls-"
            f"kpseegnga-frls-po-tu-16k121-021-2011/{slug}/"
        ),
        "kind": "manufacturer_product_page",
    }

SOURCES["holdcable_kg"] = {
    "publisher": "Холдинг Кабельный Альянс",
    "title": "Справочная информация по кабелю КГ на 660 В",
    "url": "https://www.holdcable.com/catalog/spravochnaya-informatsiya/1395000/",
    "kind": "manufacturer_reference_page",
}

PODOLSK_MARKS = {
    "mkesh": ("kabeli-montazhnye", "МКЭШ"),
    "mkeshv": ("kabeli-montazhnye", "МКЭШВ"),
    "mkekshv": ("kabeli-montazhnye", "МКЭКШв"),
    "mksh": ("kabeli-montazhnye", "МКШ"),
    "mgshv": ("kabeli-montazhnye", "МГШВ"),
    # New marks were chosen using exact-mark product counts in our catalog.
    "kmpv": ("kabeli-malogabaritnye", "КМПВ"),
    "kvkbshv": ("kabeli-kontrolnye", "КВКбШв"),
    "nv": ("kabeli-montazhnye", "НВ"),
    "bpvl": ("provoda-bortovye", "БПВЛ"),
    "mkshv": ("kabeli-montazhnye", "МКШВ"),
    "bpdo": ("provoda-bortovye", "БПДО"),
    "kupev": ("kabeli-upravleniya", "КУПЭВ"),
    "kmpvev": ("kabeli-malogabaritnye", "КМПВЭВ"),
    "kupv": ("kabeli-upravleniya", "КУПВ"),
    "kmpev": ("kabeli-malogabaritnye", "КМПЭВ"),
    "kmpevev": ("kabeli-malogabaritnye", "КМПЭВЭВ"),
    "vkbshv": ("kabeli-silovye", "ВКбШв"),
    "rpshek": ("kabeli-svyazi", "РПШЭк"),
    "nvm": ("kabeli-montazhnye", "НВМ"),
    "mkkshv": ("kabeli-montazhnye", "МККШв"),
    "kvv": ("kabeli-vodopogruzhnye", "КВВ"),
    "mpo": ("kabeli-montazhnye", "МПО"),
    "nvev": ("kabeli-montazhnye", "НВЭВ"),
    "rpshk": ("kabeli-svyazi", "РПШк"),
}
PODOLSK_PREVIOUS_MARKS = {"mkesh", "mkeshv", "mkekshv", "mksh", "mgshv"}
for slug, (category, mark) in PODOLSK_MARKS.items():
    SOURCES[f"podolsk_{slug}"] = {
        "publisher": "Завод Подольскабель",
        "title": f"{mark}: карточки продукции",
        "url": f"https://podolskkabel.ru/catalog/{category}/{slug}/",
        "kind": "manufacturer_product_page",
    }


def fetch(source_id: str, suffix: str) -> Path:
    CACHE.mkdir(parents=True, exist_ok=True)
    target = CACHE / f"{source_id}.{suffix}"
    if not target.exists():
        subprocess.run(
            ["curl", "-L", "--fail", "--silent", "--show-error", "--max-time", "90", SOURCES[source_id]["url"], "-o", str(target)],
            check=True,
        )
    return target


def number(raw: str) -> float:
    return float(raw.replace(" ", "").replace(",", "."))


def add(entries: list[dict], source: str, page: int | None, mark: str, configuration: str, voltage: float | None, diameter: float, mass: float, source_url: str | None = None) -> None:
    if not (0 < mass < 100000 and 0 < diameter < 300):
        raise ValueError(f"Implausible cable dimensions: {source} {mark} {configuration} {diameter} {mass}")
    entry = {
            "sourceId": source,
            "sourcePage": page,
            "mark": mark,
            "configuration": configuration.replace("*", "х").replace("×", "х").replace("x", "х").replace(" ", ""),
            "voltageKv": voltage,
            "diameterMm": diameter,
            "massKgPerKm": mass,
        }
    if source_url:
        entry["sourceUrl"] = source_url
    entries.append(entry)


def parse_simple_pdf_block(entries: list[dict], source: str, page: int, allowed_marks: set[str], voltage: float | None = None) -> None:
    text = PdfReader(fetch(source, "pdf")).pages[page - 1].extract_text() or ""
    mark = None
    row = re.compile(r"^(\d+\s*[х*]\s*[\d.,]+)\s+([\d.,]+)\s+([\d\s]+)$")
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if line in allowed_marks:
            mark = line
            continue
        if re.fullmatch(r"[А-ЯЁ][А-ЯЁа-яё0-9()\-]+", line):
            mark = None
            continue
        if not mark:
            continue
        match = row.match(line)
        if match:
            add(entries, source, page, mark, match[1].replace(" ", ""), voltage, number(match[2]), number(match[3]))


def parse_hka(entries: list[dict]) -> None:
    text = PdfReader(fetch("hka", "pdf")).pages[25].extract_text() or ""
    text = text.split("Расчетные наружные диаметры и массы кабеля ВВГнг(А)-LS на напряжение 1 кВ.", 1)[0]
    mark = None
    row = re.compile(r"^(\d+[х*][\d.,]+[^\n]*?)\s+([\d.]+)\s+(\d+)$")
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if line in {"ВВГнг(А)-LS", "АВВГнг(А)-LS"}:
            mark = line
            continue
        # The PDF text layer switches to another column without repeating its
        # mark. Stop before that second header instead of inheriting АВВГ.
        if mark == "АВВГнг(А)-LS" and line.startswith("Число и номинальное сечение"):
            break
        if not mark:
            continue
        match = row.match(line)
        if match and "+" not in match[1] and "или" not in match[1]:
            add(entries, "hka", 26, mark, match[1], 0.66, number(match[2]), number(match[3]))

    # Four ВВГ rows are printed in the second column before the АВВГ table;
    # the PDF text layer places them after АВВГ. Read their values explicitly.
    for configuration, diameter, mass in [
        ("5х16мк(N,PE)", 24.9, 1400),
        ("5х25мк(N,PE)", 27.9, 1961),
        ("5х35мк(N,PE)", 30.6, 2515),
        ("5х50мк(N,PE)", 35.5, 3393),
    ]:
        add(entries, "hka", 26, "ВВГнг(А)-LS", configuration, 0.66, diameter, mass)

    # This page also covers КВВГ-Т with the same tabulated values. Keep only
    # the plain КВВГ rows here so each record has one exact mark.
    text = PdfReader(fetch("hka", "pdf")).pages[193].extract_text() or ""
    block = text.split("КВВГ, КВВГ-Т", 1)[1].split("АКВВГ", 1)[0]
    for raw_line in block.splitlines():
        match = re.match(r"^(\d+х[\d.]+)\s+([\d.]+)\s+(\d+)$", raw_line.strip())
        if match:
            add(entries, "hka", 194, "КВВГ", match[1], None, number(match[2]), number(match[3]))

    # These round control-cable tables have one explicit mark heading per
    # block. Flat -П constructions use two dimensions and are not included.
    text = PdfReader(fetch("hka", "pdf")).pages[203].extract_text() or ""
    marks = {"КГВВ", "КГВВнг(А)", "КГВВз", "КГВВзнг(А)", "КГВЭВ"}
    mark = None
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if line in marks:
            mark = line
            continue
        if line == "КГВВ-П":
            mark = None
            continue
        if not mark:
            continue
        match = re.fullmatch(r"(\d+х[\d.]+)\s+([\d.]+)\s+([\d.]+)", line)
        if match:
            add(entries, "hka", 204, mark, match[1], None, number(match[2]), number(match[3]))

    # Two adjacent tables have several dimensional columns. Select only
    # diameter and mass; the extra columns on page 218 describe fire load.
    for page, marks, values_per_mark in [
        (216, ("КППГнг(А)-HF", "КППГЭнг(А)-HF", "КПБПнг(А)-HF"), 2),
        (218, ("КППГнг(А)-FRHF", "КППГЭнг(А)-FRHF"), 3),
    ]:
        text = PdfReader(fetch("hka", "pdf")).pages[page - 1].extract_text() or ""
        expected = 1 + len(marks) * values_per_mark
        for raw_line in text.splitlines():
            cells = raw_line.strip().split()
            if len(cells) != expected or not re.fullmatch(r"\d+х[\d.]+", cells[0]):
                continue
            for index, current_mark in enumerate(marks):
                offset = 1 + index * values_per_mark
                add(entries, "hka", page, current_mark, cells[0], None, number(cells[offset]), number(cells[offset + 1]))


def parse_hka_priority_marks(entries: list[dict]) -> None:
    reader = PdfReader(fetch("hka", "pdf"))

    # Page 318 separates solid polyethylene insulation (ГОСТ ТППэп) from
    # film/foam/film insulation. Use only the solid-insulation diameter/mass
    # columns so rows remain unambiguous.
    text = reader.pages[317].extract_text() or ""
    for raw_line in text.splitlines():
        cells = raw_line.replace("\u00a0", " ").strip().split()
        if len(cells) != 5 or not re.fullmatch(r"\d+[xх]2[xх][\d.]+", cells[0]):
            continue
        if cells[1] != "-" and cells[3] != "-":
            add(entries, "hka", 318, "ТППэп", cells[0], None, number(cells[1]), number(cells[3]))

    # Page 515 gives nominal 0.6/1 kV for СИП-2 and СИП-4; page 516
    # continues СИП-4 in a separate table without overlapping sizes.
    text = reader.pages[514].extract_text() or ""
    mark = None
    row = re.compile(r"^([\dхx+.]+)\s+([\d.,]+)\s+([\d.,]+)$")
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if line in {"СИП-1", "СИП-2", "СИП-3", "СИП-4"}:
            mark = line
            continue
        match = row.fullmatch(line)
        if match and mark in {"СИП-2", "СИП-4"}:
            add(entries, "hka", 515, mark, match[1], 1, number(match[2]), number(match[3]))
    text = reader.pages[515].extract_text() or ""
    block = text.split("Расчетные значения диаметра и массы провода (справочно).", 1)[1]
    for raw_line in block.splitlines():
        match = row.fullmatch(raw_line.strip())
        if match and re.match(r"^[24]х", match[1]):
            add(entries, "hka", 516, "СИП-4", match[1], 1, number(match[2]), number(match[3]))

    # Fire-resistant ППГ tables span two physical pages. Carry the active
    # heading across the page break and stop at the next product family.
    mark = None
    voltage = None
    for page in (72, 73):
        text = reader.pages[page - 1].extract_text() or ""
        for raw_line in text.splitlines():
            line = raw_line.strip()
            compact = re.sub(r"\s+", "", line)
            heading = re.fullmatch(r"ППГ(Э)?нг\(А\)-FRHF-(0\.66|1)кВ", compact)
            if heading:
                mark = "ППГЭнг(А)-FRHF" if heading[1] else "ППГнг(А)-FRHF"
                voltage = number(heading[2])
                continue
            if compact.startswith("ПвПГ"):
                mark = None
            if not mark:
                continue
            match = re.fullmatch(r"(.+?)\s+([\d.]+)\s+(\d+)", line)
            if not match:
                continue
            configuration = match[1].replace(" ", "")
            if not re.match(r"^\d+[хx]\d", configuration) or configuration.count("(") != configuration.count(")"):
                continue
            add(entries, "hka", page, mark, configuration, voltage, number(match[2]), number(match[3]))


def fetch_podolsk_product(url: str) -> tuple[str, BeautifulSoup]:
    CACHE.mkdir(parents=True, exist_ok=True)
    target = CACHE / f"podolsk-{hashlib.sha256(url.encode()).hexdigest()[:20]}.html"
    if not target.exists():
        subprocess.run(
            ["curl", "-L", "--fail", "--silent", "--show-error", "--max-time", "40", url, "-o", str(target)],
            check=True,
        )
    return url, BeautifulSoup(target.read_text(encoding="utf-8"), "html.parser")


def selected_podolsk_configuration(slug: str, configuration: str) -> bool:
    if slug != "mkeshv":
        return True
    normalized = re.sub(r"\s+", "", configuration).replace("×", "х").replace(",", ".")
    simple = re.fullmatch(r"(\d+)х([\d.]+)", normalized)
    if simple:
        return int(simple[1]) in {2, 3, 4, 5, 7, 10, 14} and number(simple[2]) in {0.5, 0.75, 1, 1.5}
    paired = re.fullmatch(r"(\d+)х2х([\d.]+)", normalized)
    return bool(paired and int(paired[1]) in {1, 2, 4, 7} and number(paired[2]) in {0.5, 0.75, 1, 1.5})


def podolsk_priority(mark: str, configuration: str, catalog_sizes: Counter) -> tuple:
    # Prefer exact core/section combinations actually listed in our catalog.
    # The catalog count is inventory breadth, not a claim about sales volume.
    values = re.findall(r"\d+(?:[,.]\d+)?", configuration)
    if not values:
        return (0, 0, 0, configuration)
    cores = int(values[0]) if len(values) > 1 else 1
    section = number(values[-1])
    return (-catalog_sizes[(mark.casefold(), cores, section)], section, cores, configuration)


def parse_podolsk(entries: list[dict]) -> None:
    product_links: dict[str, tuple[str, str, str]] = {}
    catalog_sizes = Counter(
        (product["mark"].casefold(), product["cores"], product["crossSection"])
        for product in json.loads((ROOT / "data" / "products.json").read_text(encoding="utf-8"))
        if product.get("mark") and product.get("cores") and product.get("crossSection")
    )
    for slug, (category, mark) in PODOLSK_MARKS.items():
        source_id = f"podolsk_{slug}"
        listing_url = SOURCES[source_id]["url"]
        first = BeautifulSoup(fetch(source_id, "html").read_text(encoding="utf-8"), "html.parser")
        pages = [first]
        page_numbers = [int(match[1]) for anchor in first.find_all("a", href=True)
                        if (match := re.search(r"[?&]PAGEN_1=(\d+)", anchor["href"]))]
        for page in range(2, max(page_numbers, default=1) + 1):
            _, soup = fetch_podolsk_product(f"{listing_url}?PAGEN_1={page}")
            pages.append(soup)
        prefix = f"/catalog/{category}/{slug}/{slug}-"
        candidates = {}
        for soup in pages:
            for anchor in soup.find_all("a", href=True):
                path = anchor["href"]
                title = anchor.get_text(" ", strip=True)
                if path.startswith(prefix) and title.startswith(mark + " "):
                    configuration = title[len(mark):].strip()
                    if selected_podolsk_configuration(slug, configuration):
                        url = urljoin(listing_url, path)
                        candidates[url] = (source_id, mark, configuration)
        if slug not in PODOLSK_PREVIOUS_MARKS:
            # Twelve checked size cards per new mark keep the published table
            # focused on stock-relevant and common constructions.
            candidates = dict(sorted(
                candidates.items(),
                key=lambda item: (podolsk_priority(mark, item[1][2], catalog_sizes), item[0]),
            )[:12])
        product_links.update(candidates)

    # Keep the exact product URL on each row. The category page does not show
    # diameter and mass; those are published in the individual product cards.
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for url, soup in pool.map(fetch_podolsk_product, product_links):
            source_id, mark, configuration = product_links[url]
            heading = soup.find("h1")
            if not heading or re.sub(r"\s+", "", heading.get_text()) != re.sub(r"\s+", "", mark + configuration):
                raise ValueError(f"Podolsk product title mismatch: {url}")
            attributes = {}
            for node in soup.select("p.page-product__box-desc-text"):
                label = node.find("b")
                if label:
                    attributes[label.get_text(" ", strip=True)] = node.get_text(" ", strip=True).removeprefix(label.get_text(" ", strip=True)).strip()
            diameter = attributes.get("Наружный диаметр, мм")
            mass = attributes.get("Расчётная масса, кг/км")
            if diameter and mass:
                variant = attributes.get("Вариант/Исполнение")
                if variant and re.fullmatch(r"НВМ?-\d+", variant):
                    # ГОСТ variants can share the same size and voltage while
                    # having different dimensions and masses.
                    configuration = f"{configuration} ({variant})"
                voltage_text = attributes.get("Напряжение")
                voltage = None
                if voltage_text:
                    match = re.fullmatch(r"(\d+)\s*В", voltage_text)
                    if not match:
                        raise ValueError(f"Unexpected Podolsk voltage {voltage_text}: {url}")
                    voltage = int(match[1]) / 1000
                add(entries, source_id, None, mark, configuration, voltage, number(diameter), number(mass), source_url=url)


def parse_uncomtech(entries: list[dict]) -> None:
    parse_simple_pdf_block(entries, "uncomtech", 132, {"КВВГ", "КВВГ-ХЛ"})


def parse_energokab_page(entries: list[dict], source: str, mark: str, table_count: int = 3, has_voltage: bool = True, single_core: bool = False) -> None:
    html = fetch(source, "html").read_text(encoding="utf-8")
    soup = BeautifulSoup(html, "html.parser")
    for table in soup.find_all("table")[:table_count]:
        table_text = table.get_text(" ", strip=True)
        if "Расчетная масса" not in table_text:
            continue
        for tr in table.find_all("tr"):
            cells = [td.get_text(" ", strip=True) for td in tr.find_all("td", recursive=False)]
            if len(cells) != 3:
                continue
            match = re.match(r"^(.+?)-(0,66|1|3)$", cells[0]) if has_voltage else None
            configuration = match[1] if match else cells[0]
            if single_core and re.match(r"^\d+(?:[,.]\d+)?[а-я]+$", configuration):
                configuration = f"1х{configuration}"
            # The КВВГз page repeats these two constructions with conflicting
            # masses and no distinguishing voltage/variant. Exclude both.
            if source == "energokab_kvvgz" and configuration in {"4х1,0", "5х1,0"}:
                continue
            if re.match(r"^\d+[хx]\d", configuration) and (match or not has_voltage):
                add(entries, source, None, mark, configuration.replace("x", "х"), number(match[2]) if match else None, number(cells[1]), number(cells[2]))


def parse_energokab(entries: list[dict]) -> None:
    parse_energokab_page(entries, "energokab", "ВВГнг(А)-LS")
    parse_energokab_page(entries, "energokab_avvg", "АВВГнг(А)-LS")
    parse_energokab_page(entries, "energokab_vbsh", "ВБШвнг(А)-LS")
    parse_energokab_page(entries, "energokab_pvs", "ПВС", table_count=1, has_voltage=False)
    for source, mark, _, table_count, has_voltage, single_core in ENERGOKAB_ADDITIONAL_PAGES:
        parse_energokab_page(entries, source, mark, table_count, has_voltage, single_core)


def parse_energokab_kps_frls(entries: list[dict]) -> None:
    for source_id, mark, _ in KPS_FRLS_PAGES:
        soup = BeautifulSoup(fetch(source_id, "html").read_text(encoding="utf-8"), "html.parser")
        matched = False
        for table in soup.find_all("table"):
            rows = table.find_all("tr")
            if not rows or rows[0].get_text(" ", strip=True) != mark:
                continue
            header = [cell.get_text(" ", strip=True) for cell in rows[1].find_all(["th", "td"], recursive=False)]
            if len(header) != 4 or "Число пар" not in header[0] or "Расчетная масса" not in header[3]:
                continue
            section = None
            for tr in rows[2:]:
                cells = [cell.get_text(" ", strip=True) for cell in tr.find_all(["th", "td"], recursive=False)]
                if len(cells) == 4 and cells[0] == "1" and re.fullmatch(r"\d+(?:,\d+)?", cells[1]):
                    section = cells[1]
                    add(entries, source_id, None, mark, f"1х2х{section}", 0.3, number(cells[2]), number(cells[3]))
                elif len(cells) == 3 and cells[0] == "2":
                    # Two-pair cable has rectangular outer dimensions, which
                    # the current numeric diameter field cannot represent.
                    continue
                else:
                    raise ValueError(f"Unexpected КПС row in {source_id}: {cells}")
            matched = True
            break
        if not matched:
            raise ValueError(f"Missing КПС source table: {source_id}")


def parse_holdcable_kg(entries: list[dict]) -> None:
    soup = BeautifulSoup(fetch("holdcable_kg", "html").read_text(encoding="utf-8"), "html.parser")
    heading = next(
        h for h in soup.find_all("h3")
        if "Номинальные наружные диаметры и расчетная масса кабелей марки КГ на 660 В" in h.get_text(" ", strip=True)
    )
    table = heading.find_next("table")
    for tr in table.find_all("tr"):
        cells = [td.get_text(" ", strip=True) for td in tr.find_all("td", recursive=False)]
        if len(cells) == 3 and re.fullmatch(r"\d+х\d+(?:[.,]\d+)?", cells[0]):
            add(entries, "holdcable_kg", None, "КГ", cells[0], 0.66, number(cells[1]), number(cells[2]))


def parse_paritet(entries: list[dict]) -> None:
    text = PdfReader(fetch("paritet", "pdf")).pages[5].extract_text() or ""
    row = re.compile(r"^(\d+х\d+,\d+)\s+(\d+,\d+)\s+(\d+(?:,\d+)?)\s+(\d+(?:,\d+)?)")
    for raw_line in text.splitlines():
        match = row.match(raw_line.strip())
        if not match:
            continue
        configuration, diameter, standard_mass, oil_resistant_mass = match.groups()
        # The printed table itself has several non-monotonic mass values.
        # Exclude these rows until the publisher confirms them.
        if configuration not in {"10х0,35", "10х0,75", "25х0,75"}:
            add(entries, "paritet", 6, "ТРАНСКАБ-КМПнг(А)-HF", configuration, 0.6, number(diameter), number(standard_mass))
        if configuration not in {"9х0,50", "10х0,50"}:
            add(entries, "paritet", 6, "ТРАНСКАБ-КМПМнг(А)-HF", configuration, 0.6, number(diameter), number(oil_resistant_mass))


def parse_samaracable(entries: list[dict]) -> None:
    text = PdfReader(fetch("samaracable", "pdf")).pages[108].extract_text() or ""
    diameter_block = text.split("Наружный диаметр, мм, не более, кабеля марки", 1)[1].split("Расчетная масса ТППэпнг(А)-HF", 1)[0]
    mass_block = text.split("Расчетная масса ТППэпнг(А)-HF и ТППэпПнг(А)-HF, кг/км", 1)[1]
    diameters = {}
    masses = {}
    for raw_line in diameter_block.splitlines():
        cells = raw_line.strip().split()
        if len(cells) == 6 and cells[0].isdigit() and cells[1].isdigit():
            diameters[cells[0]] = cells[2:]
    for raw_line in mass_block.splitlines():
        cells = raw_line.strip().split()
        if len(cells) == 5 and cells[0].isdigit():
            masses[cells[0]] = cells[1:]
    if not diameters or diameters.keys() != masses.keys():
        raise ValueError("Samara cable catalog diameter/mass table mismatch")
    for pair_count, dimensions in diameters.items():
        for wire_diameter, outer_diameter, mass in zip(("0,40", "0,50", "0,64", "0,70"), dimensions, masses[pair_count]):
            if outer_diameter == "-" or mass == "-":
                continue
            configuration = f"{pair_count}х2х{wire_diameter}"
            for mark in ("ТППэпнг(А)-HF", "ТППэпПнг(А)-HF"):
                add(entries, "samaracable", 109, mark, configuration, None, number(outer_diameter), number(mass))


def parse_gerda_table(entries: list[dict]) -> None:
    # This published table gives separate KV and KVK columns. Limit extraction
    # to common configurations from the local catalog, and do not extend its
    # values to fire-protection or cold-resistant versions.
    reader = PdfReader(fetch("gerda_table", "pdf"))
    row = re.compile(
        r"^(\d+)\s*х\s*2\s*х\s*(\d+,\d+)\s+(.+?)\s+"
        r"(\d+)\s*х\s*\(\s*2\s*х\s*(\d+,\d+)\)э\s+(.+)$"
    )
    pair_counts = {1, 2, 3, 4, 5, 7, 10, 14}
    sections = {0.5, 0.75, 1, 1.5}
    for page in range(1, 5):
        text = reader.pages[page - 1].extract_text() or ""
        if "ГЕРДА-КВК" not in text:
            raise ValueError(f"Gerda table heading missing on page {page}")
        for raw_line in text.splitlines():
            match = row.fullmatch(raw_line.strip())
            if not match:
                continue
            pairs, section, left, screened_pairs, screened_section, right = match.groups()
            if pairs != screened_pairs or section != screened_section:
                raise ValueError(f"Gerda configuration mismatch on page {page}: {raw_line}")
            if int(pairs) not in pair_counts or number(section) not in sections:
                continue
            left_cells = left.split()
            right_cells = right.split()
            if len(left_cells) != 8 or len(right_cells) != 8:
                raise ValueError(f"Gerda column mismatch on page {page}: {raw_line}")
            configuration = f"{pairs}х2х{section}"
            add(entries, "gerda_table", page, "ГЕРДА-КВ", configuration, None, number(left_cells[0]), number(left_cells[1]))
            add(entries, "gerda_table", page, "ГЕРДА-КВК", configuration, None, number(left_cells[2]), number(left_cells[4]))
            if right_cells[0] != "-":
                screened = f"{pairs}х(2х{section})э"
                add(entries, "gerda_table", page, "ГЕРДА-КВ", screened, None, number(right_cells[0]), number(right_cells[1]))
                add(entries, "gerda_table", page, "ГЕРДА-КВК", screened, None, number(right_cells[2]), number(right_cells[4]))


def parse_gerda_kuin(entries: list[dict]) -> None:
    reader = PdfReader(fetch("gerda_kuin", "pdf"))
    row = re.compile(r"^(\d+)\s*х\s*2\s*х\s*(\d+,\d+)\s+(.+)$")
    pair_counts = {1, 2, 3, 4, 5, 7, 10, 14}
    sections = {0.5, 0.75, 1, 1.5}
    for pages, mark_prefix in (
        (range(1, 5), "КУИН нг(А)"),
        (range(11, 14), "КУИН нг(А)-FRLS"),
    ):
        for page in pages:
            text = reader.pages[page - 1].extract_text() or ""
            heading = "КУИН (нг(А)" if mark_prefix == "КУИН нг(А)" else mark_prefix
            if heading not in text or "хх ВЭК" not in text:
                raise ValueError(f"КУИН table heading missing on page {page}")
            for raw_line in text.splitlines():
                match = row.fullmatch(raw_line.strip())
                if not match:
                    continue
                pairs, section, cell_text = match.groups()
                if int(pairs) not in pair_counts or number(section) not in sections:
                    continue
                cells = cell_text.split()
                if len(cells) != 32:
                    raise ValueError(f"КУИН column mismatch on page {page}: {raw_line}")
                configuration = f"{pairs}х2х{section}"
                # After the first eight cells for unshielded В/ВК/ВБ,
                # the next group contains ВЭ (common screen) and ВЭК
                # (common screen with wire armour). These are distinct.
                add(entries, "gerda_kuin", page, f"{mark_prefix} ВЭ", configuration, None, number(cells[8]), number(cells[9]))
                add(entries, "gerda_kuin", page, f"{mark_prefix} ВЭК", configuration, None, number(cells[10]), number(cells[12]))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    entries: list[dict] = []
    parse_hka(entries)
    parse_hka_priority_marks(entries)
    parse_uncomtech(entries)
    parse_energokab(entries)
    parse_energokab_kps_frls(entries)
    parse_holdcable_kg(entries)
    parse_paritet(entries)
    parse_samaracable(entries)
    parse_gerda_table(entries)
    parse_gerda_kuin(entries)
    parse_podolsk(entries)

    unique = {}
    for entry in entries:
        key = (entry["sourceId"], entry["mark"], entry["configuration"], entry["voltageKv"])
        if key in unique and unique[key] != entry:
            raise ValueError(f"Conflicting rows within one source: {key}")
        unique[key] = entry
    entries = sorted(unique.values(), key=lambda row: (row["mark"], row["configuration"], str(row["voltageKv"]), row["sourceId"]))
    missing_sources = set(SOURCES) - {row["sourceId"] for row in entries}
    if missing_sources or len(entries) < 4100 or len({row["mark"] for row in entries}) < 89:
        raise ValueError(f"Source table coverage unexpectedly decreased: {missing_sources=}, {len(entries)=}")
    document = {
        "schemaVersion": 1,
        "collectedOn": date.today().isoformat(),
        "description": "Manufacturer reference masses, not verified weights of our stocked lots. Source-specific rows are kept separately.",
        "sources": SOURCES,
        "entries": entries,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(entries)} reference rows to {args.output}")
    for source_id in SOURCES:
        print(f"  {source_id}: {sum(row['sourceId'] == source_id for row in entries)}")


if __name__ == "__main__":
    main()
