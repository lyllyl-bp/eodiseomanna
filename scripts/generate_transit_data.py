#!/usr/bin/env python3
"""Generate the compact subway graph bundled with the MVP.

Inputs are downloaded official CSV/XLSX files. The generated TypeScript contains
only station metadata and median segment/transfer times, so the app has no runtime
dependency on pandas or the source workbooks.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import statistics
from collections import defaultdict
from datetime import datetime, time
from pathlib import Path

import pandas as pd


LINE_META = {
    "1": ("1호선", "#0052A4", 3),
    "2": ("2호선", "#00A84D", 2),
    "3": ("3호선", "#EF7C1C", 3),
    "4": ("4호선", "#00A5DE", 3),
    "5": ("5호선", "#996CAC", 3),
    "6": ("6호선", "#CD7C2F", 4),
    "7": ("7호선", "#747F00", 3),
    "8": ("8호선", "#E6186C", 4),
    "9": ("9호선", "#BDB092", 4),
    "S": ("신분당선", "#D4003B", 3),
    "GJ": ("경의중앙선", "#77C4A3", 7),
    "SB": ("수인분당선", "#FABE00", 6),
    "I1": ("인천1호선", "#7CA8D5", 4),
    "I2": ("인천2호선", "#ED8B00", 3),
    "SH": ("서해선", "#8FC31F", 7),
    "GC": ("경춘선", "#178C72", 7),
    "AR": ("공항철도", "#0095DA", 4),
}

TRANSFER_LINE_IDS = {
    "경의선": "GJ",
    "수인분당선": "SB",
    "신분당선": "S",
    "인천선": "I1",
    "인천2": "I2",
    "서해선": "SH",
    "경춘선": "GC",
    "공항철도": "AR",
}

STATION_ALIASES = {
    "서울": "서울역",
    "신인천": "인천",
    "남동인": "남동인더스파크",
    "인천논": "인천논현",
    "소래포": "소래포구",
    "신길온": "신길온천",
    "신수원": "수원",
    "수원시": "수원시청",
    "매탄권": "매탄권선",
    "강남구": "강남구청",
    "로데오": "압구정로데오",
    "구룡역": "구룡",
    "신초지": "초지",
    "시흥능": "시흥능곡",
    "시흥청": "시흥시청",
    "신신현": "신현",
    "신신천": "신천",
    "시흥대": "시흥대야",
    "신소사": "소사",
    "부천종": "부천종합운동장",
    "신김포": "김포공항",
    "평내호": "평내호평",
    "1양정": "양정",
    "1양원": "양원",
    "효창공": "효창공원앞",
    "홍대입": "홍대입구",
    "디엠시": "디지털미디어시티",
    "총신대입구(이수)": "이수",
    "총신대입구": "이수",
}

SHINBUNDANG = [
    "신사", "논현", "신논현", "강남", "양재", "양재시민의숲", "청계산입구", "판교",
    "정자", "미금", "동천", "수지구청", "성복", "상현", "광교중앙", "광교",
]

# Incheon Transit Corporation publishes the station order and travel time from
# the previous station at https://www.ictr.or.kr/main/railway/intro.jsp.
INCHEON_LINES = {
    "I1": [
        ("검단호수공원", None), ("신검단중앙", "1:30"), ("아라", "2:00"), ("계양", "4:00"),
        ("귤현", "1:30"), ("박촌", "2:30"), ("임학", "1:30"), ("계산", "1:30"),
        ("경인교대입구", "1:30"), ("작전", "1:00"), ("갈산", "1:30"), ("부평구청", "1:30"),
        ("부평시장", "1:30"), ("부평", "1:00"), ("동수", "1:30"), ("부평삼거리", "1:30"),
        ("간석오거리", "1:30"), ("인천시청", "2:30"), ("예술회관", "1:30"),
        ("인천터미널", "1:00"), ("문학경기장", "1:00"), ("선학", "1:00"), ("신연수", "1:30"),
        ("원인재", "1:00"), ("동춘", "1:30"), ("동막", "1:30"), ("캠퍼스타운", "2:00"),
        ("테크노파크", "1:00"), ("지식정보단지", "2:00"), ("인천대입구", "1:00"),
        ("센트럴파크", "1:00"), ("국제업무지구", "1:30"), ("송도달빛축제공원", "1:30"),
    ],
    "I2": [
        ("검단오류", None), ("왕길", "1:30"), ("검단사거리", "2:07"), ("마전", "1:43"),
        ("완정", "1:16"), ("독정", "1:12"), ("검암", "1:56"), ("검바위", "1:15"),
        ("아시아드경기장", "2:00"), ("서구청", "1:07"), ("가정", "2:16"),
        ("가정중앙시장", "1:36"), ("석남", "1:23"), ("서부여성회관", "1:12"),
        ("인천가좌", "1:29"), ("가재울", "1:59"), ("주안국가산단", "1:49"),
        ("주안", "1:15"), ("시민공원", "1:38"), ("석바위시장", "1:16"),
        ("인천시청", "1:04"), ("석천사거리", "1:17"), ("모래내시장", "1:07"),
        ("만수", "1:17"), ("남동구청", "2:11"), ("인천대공원", "2:00"), ("운연", "2:06"),
    ],
}


def normalize_station(value: object) -> str:
    name = str(value).strip()
    name = re.sub(r"\s+", "", name)
    name = STATION_ALIASES.get(name, name)
    name = re.sub(r"\([^)]*\)$", "", name)
    return STATION_ALIASES.get(name, name)


def seconds(value: object) -> int | None:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    if isinstance(value, datetime):
        return value.hour * 3600 + value.minute * 60 + value.second
    if isinstance(value, time):
        return value.hour * 3600 + value.minute * 60 + value.second
    if isinstance(value, (float, int)) and 0 <= float(value) < 2:
        return round(float(value) * 86400)
    match = re.search(r"(\d{1,2}):(\d{2})(?::(\d{2}))?", str(value))
    if not match:
        return None
    hour, minute, second = (int(part or 0) for part in match.groups())
    return hour * 3600 + minute * 60 + second


def elapsed(start: int | None, end: int | None) -> int | None:
    if start is None or end is None:
        return None
    if end < start:
        end += 86400
    duration = end - start
    return duration if 20 <= duration <= 1200 else None


def duration_seconds(value: object) -> int | None:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    parts = re.findall(r"\d+", str(value))
    if len(parts) == 2:
        minute, second = map(int, parts)
        return minute * 60 + second
    if len(parts) == 3:
        hour, minute, second = map(int, parts)
        return hour * 3600 + minute * 60 + second
    return None


def rounded_median(values: list[int]) -> float:
    return max(0.5, round((statistics.median(values) / 60) * 2) / 2)


def add_segment(
    samples: dict[tuple[str, str, str], list[int]],
    line_id: str,
    first: str,
    second: str,
    duration: int | None,
) -> None:
    if duration is None or first == second:
        return
    left, right = sorted((first, second))
    samples[(line_id, left, right)].append(duration)


def parse_seoul(path: Path):
    frame = pd.read_csv(path, encoding="cp949", dtype=str)
    frame = frame[(frame["주중주말"] == "DAY") & (frame["급행여부"] == "0")].copy()
    frame["호선"] = frame["호선"].str.strip()
    frame["역사명"] = frame["역사명"].map(normalize_station)
    frame["역사코드"] = frame["역사코드"].str.strip().str.zfill(4)
    samples: dict[tuple[str, str, str], list[int]] = defaultdict(list)
    code_lookup: dict[str, list[tuple[str, str]]] = defaultdict(list)

    for row in frame[["호선", "역사코드", "역사명"]].drop_duplicates().itertuples(index=False):
        code_lookup[row.역사코드].append((row.호선, row.역사명))

    for (line_id, _train), group in frame.groupby(["호선", "열차코드"], sort=False):
        stops = []
        for row in group.itertuples(index=False):
            arrival = seconds(row.열차도착시간)
            departure = seconds(row.열차출발시간)
            clock = arrival if arrival is not None else departure
            if clock is not None:
                stops.append((clock, row.역사명, arrival, departure))
        stops.sort(key=lambda item: item[0])
        for current, following in zip(stops, stops[1:]):
            start = current[3] if current[3] is not None else current[2]
            end = following[2] if following[2] is not None else following[3]
            add_segment(samples, line_id, current[1], following[1], elapsed(start, end))

    return samples, code_lookup


def workbook_station_rows(frame: pd.DataFrame):
    rows = []
    for index in range(4, len(frame), 2):
        raw = frame.iat[index, 0]
        if pd.isna(raw) or not str(raw).strip():
            continue
        rows.append((index, normalize_station(raw)))
    return rows


def parse_workbook(path: Path, line_id: str, sheets: list[str]):
    samples: dict[tuple[str, str, str], list[int]] = defaultdict(list)
    book = pd.ExcelFile(path)
    for sheet in sheets:
        if sheet not in book.sheet_names:
            continue
        frame = pd.read_excel(book, sheet_name=sheet, header=None)
        station_rows = workbook_station_rows(frame)
        for (row_index, station), (next_row_index, next_station) in zip(station_rows, station_rows[1:]):
            for column in range(1, frame.shape[1]):
                start = seconds(frame.iat[row_index + 1, column])
                if start is None:
                    start = seconds(frame.iat[row_index, column])
                end = seconds(frame.iat[next_row_index, column])
                if end is None and next_row_index + 1 < len(frame):
                    end = seconds(frame.iat[next_row_index + 1, column])
                add_segment(samples, line_id, station, next_station, elapsed(start, end))
    return samples


def parse_arex(path: Path):
    samples: dict[tuple[str, str, str], list[int]] = defaultdict(list)
    sections = [
        (42, list(range(12, 20, 2)) + list(range(22, 42, 2))),
        (84, list(range(50, 70, 2)) + list(range(72, 80, 2))),
    ]
    for sheet in ("평일", "휴일"):
        frame = pd.read_excel(path, sheet_name=sheet, header=None)
        for remark_row, station_rows in sections:
            for row_index, next_row_index in zip(station_rows, station_rows[1:]):
                first = normalize_station(frame.iat[row_index, 0])
                second = normalize_station(frame.iat[next_row_index, 0])
                for column in range(1, frame.shape[1]):
                    if str(frame.iat[remark_row, column]).strip() == "직통":
                        continue
                    start = seconds(frame.iat[row_index + 1, column])
                    if start is None:
                        start = seconds(frame.iat[row_index, column])
                    end = seconds(frame.iat[next_row_index, column])
                    if end is None and next_row_index + 1 < len(frame):
                        end = seconds(frame.iat[next_row_index + 1, column])
                    add_segment(samples, "AR", first, second, elapsed(start, end))
    return samples


def merge_samples(*groups):
    merged: dict[tuple[str, str, str], list[int]] = defaultdict(list)
    for group in groups:
        for key, values in group.items():
            merged[key].extend(values)
    return merged


def parse_transfers(path: Path, code_lookup, line_stations):
    frame = pd.read_csv(path, encoding="cp949", dtype=str)
    samples: dict[tuple[str, str, str], list[int]] = defaultdict(list)
    for row in frame.itertuples(index=False):
        raw_source_line = str(row[3]).strip()
        source_line = TRANSFER_LINE_IDS.get(raw_source_line, raw_source_line)
        if source_line not in LINE_META:
            continue
        station = normalize_station(row[1])
        target_code = str(row[7]).strip().zfill(4)
        duration = duration_seconds(row[11])
        if duration is None:
            continue
        targets = [line_id for line_id, target_station in code_lookup.get(target_code, []) if target_station == station]
        if not targets:
            targets = [line_id for line_id, stations in line_stations.items() if line_id != source_line and station in stations]
        for target_line in targets:
            if target_line != source_line:
                samples[(station, source_line, target_line)].append(duration)
    return samples


def ts(value) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--seoul", type=Path, required=True)
    parser.add_argument("--transfers", type=Path, required=True)
    parser.add_argument("--suin-bundang", type=Path, required=True)
    parser.add_argument("--gyeongui", type=Path, required=True)
    parser.add_argument("--arex", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    seoul, code_lookup = parse_seoul(args.seoul)
    suin = parse_workbook(args.suin_bundang, "SB", ["평일상행", "평일하행", "휴일상행", "휴일하행"])
    gyeongui = parse_workbook(
        args.gyeongui,
        "GJ",
        ["경의중앙선 상행", "경의중앙선 하행", "경의선 상행", "경의선 하행"],
    )
    seohae = parse_workbook(args.gyeongui, "SH", ["서해선 상행", "서해선 하행"])
    gyeongchun = parse_workbook(args.gyeongui, "GC", ["경춘선 상행", "경춘선 하행"])
    arex = parse_arex(args.arex)
    samples = merge_samples(seoul, suin, gyeongui, seohae, gyeongchun, arex)

    for first, second in zip(SHINBUNDANG, SHINBUNDANG[1:]):
        add_segment(samples, "S", first, second, 180)

    for line_id, stations in INCHEON_LINES.items():
        for (first, _), (second, travel_time) in zip(stations, stations[1:]):
            add_segment(samples, line_id, first, second, duration_seconds(travel_time))

    line_stations: dict[str, set[str]] = defaultdict(set)
    for line_id, first, second in samples:
        line_stations[line_id].update((first, second))

    lines = []
    for line_id, (label, color, wait_minutes) in LINE_META.items():
        stations = sorted(line_stations[line_id])
        lines.append({
            "id": line_id,
            "label": label,
            "color": color,
            "waitMinutes": wait_minutes,
            "stations": stations,
        })

    ride_edges = [
        {"lineId": line_id, "from": first, "to": second, "minutes": rounded_median(values)}
        for (line_id, first, second), values in sorted(samples.items())
        if values
    ]

    transfer_samples = parse_transfers(args.transfers, code_lookup, line_stations)
    transfer_edges = [
        {
            "stationId": station,
            "fromLineId": source,
            "toLineId": target,
            "walkMinutes": rounded_median(values),
        }
        for (station, source, target), values in sorted(transfer_samples.items())
        if values
    ]

    output = "// Generated by scripts/generate_transit_data.py. Do not edit by hand.\n\n"
    output += "export const generatedLines = " + ts(lines) + " as const;\n\n"
    output += "export const generatedRideEdges = " + ts(ride_edges) + " as const;\n\n"
    output += "export const generatedTransferEdges = " + ts(transfer_edges) + " as const;\n"
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(output, encoding="utf-8")
    print(f"Generated {len(lines)} lines, {len(ride_edges)} ride edges, {len(transfer_edges)} transfer edges")


if __name__ == "__main__":
    main()
