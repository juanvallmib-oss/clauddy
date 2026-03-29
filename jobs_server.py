"""Jobs server — LinkedIn + USAJobs + The Muse"""
import json, urllib.request, urllib.parse, re, ssl, certifi, time
from bs4 import BeautifulSoup
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

CTX = ssl.create_default_context(cafile=certifi.where())
app = Flask(__name__, static_folder=".")
CORS(app)

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
}

def clean(html):
    return re.sub(r'<[^>]+>', ' ', html or '').replace('&amp;','&').replace('&nbsp;',' ').strip()[:300]

def pick_icon(title):
    t = (title or '').lower()
    if 'mechanic' in t or 'auto' in t or 'technician' in t: return '🔧'
    if 'aerospace' in t or 'flight' in t or 'aviation' in t: return '✈️'
    if 'civil' in t or 'struct' in t: return '🏗️'
    if 'electric' in t: return '⚡'
    if 'chemical' in t: return '⚗️'
    if 'software' in t or 'data' in t: return '💻'
    return '⚙️'

def guess_schedule(text):
    t = (text or '').lower()
    if 'weekend' in t: return 'Weekend'
    if 'part-time' in t or 'part time' in t: return 'Part-time'
    if 'remote' in t: return 'Remote'
    if 'hybrid' in t: return 'Hybrid'
    return 'On-site'

def resolve_zip(zipcode):
    try:
        url = f"https://api.zippopotam.us/us/{zipcode}"
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=5, context=CTX) as r:
            d = json.loads(r.read())
        place = d.get("places", [{}])[0]
        return place.get("place name",""), place.get("state abbreviation",""), place.get("state","")
    except:
        return "", "", ""

@app.route("/")
def index():
    return send_from_directory(".", "internships.html")

@app.route("/jobs")
def jobs():
    query    = request.args.get("q", "mechanical engineering intern")
    location = request.args.get("location", "").strip()
    results  = []

    # Resolve zip to city/state for better searches
    display_loc = location
    zip_match = re.search(r'\b(\d{5})\b', location)
    if zip_match:
        city, state, state_full = resolve_zip(zip_match.group(1))
        if city:
            display_loc = f"{city}, {state}"

    # ── LinkedIn public search ────────────────────────────────────────────────
    try:
        for start in [0, 25]:
            params = urllib.parse.urlencode({
                'keywords': query,
                'location': display_loc or location,
                'distance': 50,
                'f_JT': 'I',  # Internship job type
                'start': start,
            })
            url = f"https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?{params}"
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=10, context=CTX) as r:
                html = r.read().decode('utf-8', errors='replace')
            soup = BeautifulSoup(html, 'html.parser')
            for card in soup.find_all('li'):
                title_el   = card.find('h3')
                company_el = card.find('h4')
                loc_el     = card.find('span', class_=lambda c: c and 'job-search-card__location' in (c or ''))
                link_el    = card.find('a', href=True)
                if not title_el: continue
                results.append({
                    'title':    title_el.get_text(strip=True),
                    'company':  company_el.get_text(strip=True) if company_el else '',
                    'location': loc_el.get_text(strip=True) if loc_el else display_loc,
                    'url':      link_el['href'].split('?')[0] if link_el else '#',
                    'desc':     '',
                    'schedule': 'On-site',
                    'source':   'LinkedIn',
                    'icon':     pick_icon(title_el.get_text()),
                })
            time.sleep(0.5)
    except Exception as e:
        print("LinkedIn error:", e)

    # ── USAJobs ───────────────────────────────────────────────────────────────
    try:
        params = urllib.parse.urlencode({
            'Keyword': query,
            'LocationName': display_loc or location,
            'Radius': 50,
            'ResultsPerPage': 25,
        })
        req = urllib.request.Request(
            f"https://data.usajobs.gov/api/Search?{params}",
            headers={'Host': 'data.usajobs.gov', 'User-Agent': 'internfinder@example.com'}
        )
        with urllib.request.urlopen(req, timeout=10, context=CTX) as r:
            data = json.loads(r.read())
        for item in data.get('SearchResult',{}).get('SearchResultItems',[]):
            d = item.get('MatchedObjectDescriptor',{})
            summary = d.get('UserArea',{}).get('Details',{}).get('JobSummary','') or d.get('QualificationSummary','')
            results.append({
                'title':    d.get('PositionTitle',''),
                'company':  d.get('OrganizationName',''),
                'location': d.get('PositionLocationDisplay',''),
                'url':      (d.get('ApplyURI') or ['#'])[0],
                'desc':     clean(summary),
                'schedule': d.get('PositionSchedule',[{}])[0].get('Name','On-site'),
                'source':   'USAJobs',
                'icon':     pick_icon(d.get('PositionTitle','')),
            })
    except Exception as e:
        print("USAJobs error:", e)

    # ── The Muse fallback (remote/flexible roles) ─────────────────────────────
    try:
        req = urllib.request.Request(
            'https://www.themuse.com/api/public/jobs?level=Internship&page=0&descending=true',
            headers=HEADERS
        )
        with urllib.request.urlopen(req, timeout=8, context=CTX) as r:
            data = json.loads(r.read())
        for j in data.get('results', []):
            locs = [l['name'] for l in j.get('locations', [])]
            loc_str = ', '.join(locs)
            # Only add Muse jobs that are remote/flexible or match location
            content = j.get('contents','')
            sched = guess_schedule(content + loc_str)
            if sched in ('Remote', 'Hybrid') or not locs:
                results.append({
                    'title':    j.get('name',''),
                    'company':  j.get('company',{}).get('name',''),
                    'location': loc_str or 'Remote / Flexible',
                    'url':      j.get('refs',{}).get('landing_page','#'),
                    'desc':     clean(content),
                    'schedule': sched,
                    'source':   'The Muse',
                    'icon':     pick_icon(j.get('name','')),
                })
    except Exception as e:
        print("Muse error:", e)

    # ── Deduplicate + filter blanks ───────────────────────────────────────────
    results = [r for r in results if r.get('title') and r.get('company')]
    seen, unique = set(), []
    for r in results:
        key = (r['title'] + r['company']).lower()
        if key not in seen:
            seen.add(key)
            unique.append(r)

    return jsonify(unique)

if __name__ == "__main__":
    print("💼 Jobs server → http://localhost:5051")
    app.run(port=5051, debug=False)
