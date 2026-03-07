export type AllowedEntry = { name: string; suffix: string };

// Snapshot fallback from /srv/shopify-sync/api/data/allowed-variations.xlsx.
// Used when DB/file mapping cannot be read at runtime.
export const FALLBACK_ALLOWED_COLORS: AllowedEntry[] = [
  {
    "name": "Svart",
    "suffix": "B"
  },
  {
    "name": "Beige",
    "suffix": "BE"
  },
  {
    "name": "Krämvit",
    "suffix": "BE"
  },
  {
    "name": "Sand",
    "suffix": "BE"
  },
  {
    "name": "Blå",
    "suffix": "BL"
  },
  {
    "name": "Brons",
    "suffix": "BR"
  },
  {
    "name": "Brun",
    "suffix": "BR"
  },
  {
    "name": "Kamouflage",
    "suffix": "CA"
  },
  {
    "name": "Champagne",
    "suffix": "CH"
  },
  {
    "name": "Koppar",
    "suffix": "CO"
  },
  {
    "name": "Kallvit",
    "suffix": "CW"
  },
  {
    "name": "Kristall",
    "suffix": "CY"
  },
  {
    "name": "Mörkblå",
    "suffix": "DBL"
  },
  {
    "name": "Mörkbrun",
    "suffix": "DBR"
  },
  {
    "name": "Mörkgrön",
    "suffix": "DGR"
  },
  {
    "name": "Mörkgrå",
    "suffix": "DGY"
  },
  {
    "name": "Mörkorange",
    "suffix": "DOR"
  },
  {
    "name": "Mörkrosa",
    "suffix": "DP"
  },
  {
    "name": "Mörklila",
    "suffix": "DPU"
  },
  {
    "name": "Vinröd",
    "suffix": "DR"
  },
  {
    "name": "Guld",
    "suffix": "G"
  },
  {
    "name": "Grön",
    "suffix": "GR"
  },
  {
    "name": "Grå",
    "suffix": "GY"
  },
  {
    "name": "Khaki",
    "suffix": "KH"
  },
  {
    "name": "Ljusblå",
    "suffix": "LBL"
  },
  {
    "name": "Ljusbrun",
    "suffix": "LBR"
  },
  {
    "name": "Ljusgrön",
    "suffix": "LGR"
  },
  {
    "name": "Ljusgrå",
    "suffix": "LGY"
  },
  {
    "name": "Aprikos",
    "suffix": "LOR"
  },
  {
    "name": "Ljusrosa",
    "suffix": "LP"
  },
  {
    "name": "Ljuslila",
    "suffix": "LPU"
  },
  {
    "name": "Ljusröd",
    "suffix": "LR"
  },
  {
    "name": "Ljusgul",
    "suffix": "LY"
  },
  {
    "name": "Orange",
    "suffix": "OR"
  },
  {
    "name": "Rosa",
    "suffix": "P"
  },
  {
    "name": "Lila",
    "suffix": "PU"
  },
  {
    "name": "Röd",
    "suffix": "R"
  },
  {
    "name": "Flerfärgad",
    "suffix": "RGB"
  },
  {
    "name": "Cerise",
    "suffix": "ROG"
  },
  {
    "name": "Rosa guld",
    "suffix": "ROG"
  },
  {
    "name": "Silver",
    "suffix": "S"
  },
  {
    "name": "Genomskinlig",
    "suffix": "TR"
  },
  {
    "name": "Transparent",
    "suffix": "TR"
  },
  {
    "name": "Grädde",
    "suffix": "W"
  },
  {
    "name": "Vit",
    "suffix": "W"
  },
  {
    "name": "Varmvit",
    "suffix": "WW"
  },
  {
    "name": "Gul",
    "suffix": "Y"
  },
  {
    "name": "Mörkröd",
    "suffix": "DR"
  },
  {
    "name": "Turkos",
    "suffix": "GR"
  }
];

export const FALLBACK_ALLOWED_SIZES: AllowedEntry[] = [
  {
    "name": "1",
    "suffix": "1"
  },
  {
    "name": "2",
    "suffix": "2"
  },
  {
    "name": "3",
    "suffix": "3"
  },
  {
    "name": "4",
    "suffix": "4"
  },
  {
    "name": "5",
    "suffix": "5"
  },
  {
    "name": "6",
    "suffix": "6"
  },
  {
    "name": "7",
    "suffix": "7"
  },
  {
    "name": "8",
    "suffix": "8"
  },
  {
    "name": "9",
    "suffix": "9"
  },
  {
    "name": "10",
    "suffix": "10"
  },
  {
    "name": "11",
    "suffix": "11"
  },
  {
    "name": "12",
    "suffix": "12"
  },
  {
    "name": "13",
    "suffix": "13"
  },
  {
    "name": "14",
    "suffix": "14"
  },
  {
    "name": "15",
    "suffix": "15"
  },
  {
    "name": "16",
    "suffix": "16"
  },
  {
    "name": "17",
    "suffix": "17"
  },
  {
    "name": "18",
    "suffix": "18"
  },
  {
    "name": "19",
    "suffix": "19"
  },
  {
    "name": "20",
    "suffix": "20"
  },
  {
    "name": "21",
    "suffix": "21"
  },
  {
    "name": "22",
    "suffix": "22"
  },
  {
    "name": "23",
    "suffix": "23"
  },
  {
    "name": "24",
    "suffix": "24"
  },
  {
    "name": "25",
    "suffix": "25"
  },
  {
    "name": "26",
    "suffix": "26"
  },
  {
    "name": "27",
    "suffix": "27"
  },
  {
    "name": "28",
    "suffix": "28"
  },
  {
    "name": "29",
    "suffix": "29"
  },
  {
    "name": "30",
    "suffix": "30"
  },
  {
    "name": "31",
    "suffix": "31"
  },
  {
    "name": "32",
    "suffix": "32"
  },
  {
    "name": "33",
    "suffix": "33"
  },
  {
    "name": "34",
    "suffix": "34"
  },
  {
    "name": "35",
    "suffix": "35"
  },
  {
    "name": "36",
    "suffix": "36"
  },
  {
    "name": "37",
    "suffix": "37"
  },
  {
    "name": "38",
    "suffix": "38"
  },
  {
    "name": "39",
    "suffix": "39"
  },
  {
    "name": "40",
    "suffix": "40"
  },
  {
    "name": "41",
    "suffix": "41"
  },
  {
    "name": "42",
    "suffix": "42"
  },
  {
    "name": "43",
    "suffix": "43"
  },
  {
    "name": "44",
    "suffix": "44"
  },
  {
    "name": "45",
    "suffix": "45"
  },
  {
    "name": "46",
    "suffix": "46"
  },
  {
    "name": "47",
    "suffix": "47"
  },
  {
    "name": "48",
    "suffix": "48"
  },
  {
    "name": "49",
    "suffix": "49"
  },
  {
    "name": "50",
    "suffix": "50"
  },
  {
    "name": "51",
    "suffix": "51"
  },
  {
    "name": "52",
    "suffix": "52"
  },
  {
    "name": "53",
    "suffix": "53"
  },
  {
    "name": "54",
    "suffix": "54"
  },
  {
    "name": "56",
    "suffix": "56"
  },
  {
    "name": "60",
    "suffix": "60"
  },
  {
    "name": "65",
    "suffix": "65"
  },
  {
    "name": "70",
    "suffix": "70"
  },
  {
    "name": "80",
    "suffix": "80"
  },
  {
    "name": "90",
    "suffix": "90"
  },
  {
    "name": "100",
    "suffix": "100"
  },
  {
    "name": "105",
    "suffix": "105"
  },
  {
    "name": "110",
    "suffix": "110"
  },
  {
    "name": "115",
    "suffix": "115"
  },
  {
    "name": "116",
    "suffix": "116"
  },
  {
    "name": "120",
    "suffix": "120"
  },
  {
    "name": "125",
    "suffix": "125"
  },
  {
    "name": "128",
    "suffix": "128"
  },
  {
    "name": "130",
    "suffix": "130"
  },
  {
    "name": "140",
    "suffix": "140"
  },
  {
    "name": "150",
    "suffix": "150"
  },
  {
    "name": "152",
    "suffix": "152"
  },
  {
    "name": "156",
    "suffix": "156"
  },
  {
    "name": "160",
    "suffix": "160"
  },
  {
    "name": "164",
    "suffix": "164"
  },
  {
    "name": "A",
    "suffix": "A"
  },
  {
    "name": "B",
    "suffix": "B"
  },
  {
    "name": "C",
    "suffix": "C"
  },
  {
    "name": "D",
    "suffix": "D"
  },
  {
    "name": "L",
    "suffix": "L"
  },
  {
    "name": "M",
    "suffix": "M"
  },
  {
    "name": "One-size",
    "suffix": "OS"
  },
  {
    "name": "S",
    "suffix": "S"
  },
  {
    "name": "XL",
    "suffix": "XL"
  },
  {
    "name": "XS",
    "suffix": "XS"
  },
  {
    "name": "XXL",
    "suffix": "XXL"
  },
  {
    "name": "XXS",
    "suffix": "XXS"
  },
  {
    "name": "XXXL",
    "suffix": "XXXL"
  },
  {
    "name": "XXXS",
    "suffix": "XXXS"
  },
  {
    "name": "XXXXL",
    "suffix": "XXXXL"
  },
  {
    "name": "XXXXXL",
    "suffix": "XXXXXL"
  },
  {
    "name": "XXXXXXL",
    "suffix": "XXXXXXL"
  },
  {
    "name": "XXXXXXXL",
    "suffix": "XXXXXXXL"
  }
];
