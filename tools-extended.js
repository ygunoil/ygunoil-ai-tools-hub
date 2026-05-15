(function () {
    'use strict';

    window.__TOOLS_NAV_EXTRA = [
        { id: 'uuid', label: 'UUID' },
        { id: 'random', label: 'Random' },
        { id: 'lorem', label: 'Lorem' },
        { id: 'b64text', label: 'Base64 text' },
        { id: 'hex', label: 'Hex' },
        { id: 'rot13', label: 'ROT13' },
        { id: 'email', label: 'Email' },
        { id: 'regex', label: 'Regex' },
        { id: 'sortlines', label: 'Sort lines' },
        { id: 'reverse', label: 'Reverse' },
        { id: 'dedupe', label: 'Dedupe lines' },
        { id: 'slug', label: 'Slug' },
        { id: 'htmlent', label: 'HTML entities' },
        { id: 'jwt', label: 'JWT decode' },
        { id: 'csvjson', label: 'CSV/JSON' },
        { id: 'radix', label: 'Radix' },
        { id: 'utf8len', label: 'UTF-8 length' },
        { id: 'jescape', label: 'JS escape' },
        { id: 'httpcode', label: 'HTTP codes' },
        { id: 'stopwatch', label: 'Stopwatch' },
        { id: 'worldtime', label: 'World clock' },
        { id: 'age', label: 'Age' },
        { id: 'bmi', label: 'BMI' },
        { id: 'tip', label: 'Tip' },
        { id: 'loan', label: 'Loan' },
        { id: 'compound', label: 'Compound' },
        { id: 'roman', label: 'Roman' },
        { id: 'diff', label: 'Diff' },
        { id: 'striphtml', label: 'Strip HTML' },
        { id: 'linenum', label: 'Line #' },
        { id: 'randline', label: 'Random line' },
        { id: 'repeat', label: 'Repeat' },
        { id: 'pad', label: 'Pad' },
        { id: 'exturl', label: 'URLs' },
        { id: 'extemail', label: 'Emails' },
        { id: 'metagen', label: 'Meta tags' },
        { id: 'wordwrap', label: 'Word wrap' },
        { id: 'cronhelp', label: 'Cron' },
        { id: 'shades', label: 'Shades' },
        { id: 'round', label: 'Round' }
    ];

    /** Sidebar links to full-page apps (not hash panels). Rendered after inline NAV in tools.html */
    window.__TOOLS_STANDALONE_NAV = [
        { href: 'gallery-viewer/index.html', label: 'Gallery Viewer', title: 'Local photos, videos & audio — opens full page' }
    ];

    function M(t) {
        if (typeof window.showToolMsg === 'function') window.showToolMsg(t);
    }

    function rot13(s) {
        return s.replace(/[a-zA-Z]/g, function (c) {
            const b = c <= 'Z' ? 65 : 97;
            return String.fromCharCode(((c.charCodeAt(0) - b + 13) % 26) + b);
        });
    }

    function slugify(s) {
        return s.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '');
    }

    const HTTP_CODES = {
        100: 'Continue', 101: 'Switching Protocols', 200: 'OK', 201: 'Created', 204: 'No Content',
        301: 'Moved Permanently', 302: 'Found', 304: 'Not Modified', 400: 'Bad Request', 401: 'Unauthorized',
        403: 'Forbidden', 404: 'Not Found', 408: 'Request Timeout', 409: 'Conflict', 429: 'Too Many Requests',
        500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable', 504: 'Gateway Timeout'
    };

    function romanize(num) {
        if (num < 1 || num > 3999) return '';
        const M = ['', 'M', 'MM', 'MMM'], C = ['', 'C', 'CC', 'CCC', 'CD', 'D', 'DC', 'DCC', 'DCCC', 'CM'],
            X = ['', 'X', 'XX', 'XXX', 'XL', 'L', 'LX', 'LXX', 'LXXX', 'XC'], I = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];
        return M[Math.floor(num / 1000)] + C[Math.floor((num % 1000) / 100)] + X[Math.floor((num % 100) / 10)] + I[num % 10];
    }

    function romanFromStr(str) {
        const map = { M: 1000, CM: 900, D: 500, CD: 400, C: 100, XC: 90, L: 50, XL: 40, X: 10, IX: 9, V: 5, IV: 4, I: 1 };
        let i = 0, n = 0;
        const u = str.toUpperCase().trim();
        while (i < u.length) {
            let matched = false;
            for (const k of Object.keys(map).sort((a, b) => b.length - a.length)) {
                if (u.startsWith(k, i)) { n += map[k]; i += k.length; matched = true; break; }
            }
            if (!matched) return NaN;
        }
        return n;
    }

    function simpleCsvToJson(text) {
        const lines = text.trim().split(/\r?\n/).filter(Boolean);
        if (!lines.length) return [];
        const sep = lines[0].includes('\t') ? '\t' : ',';
        const headers = lines[0].split(sep).map(h => h.trim().replace(/^"|"$/g, ''));
        return lines.slice(1).map(line => {
            const cells = line.split(sep).map(c => c.trim().replace(/^"|"$/g, ''));
            const o = {};
            headers.forEach((h, i) => { o[h] = cells[i] ?? ''; });
            return o;
        });
    }

    function simpleJsonToCsv(arr) {
        if (!Array.isArray(arr) || !arr.length) return '';
        const keys = Object.keys(arr[0]);
        const esc = (v) => {
            const s = String(v ?? '');
            if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
            return s;
        };
        return [keys.join(','), ...arr.map(row => keys.map(k => esc(row[k])).join(','))].join('\n');
    }

    function parseJwt(token) {
        const p = token.trim().split('.');
        if (p.length < 2) throw new Error('Not a standard JWT');
        let b64 = p[1].replace(/-/g, '+').replace(/_/g, '/');
        while (b64.length % 4) b64 += '=';
        const json = decodeURIComponent(atob(b64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
        return { header: p[0], payload: JSON.parse(json) };
    }

    function parseHexRgb(hex) {
        let h = hex.trim().replace(/^#/, '');
        if (h.length === 3) h = h.split('').map(c => c + c).join('');
        if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
        return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
    }

    window.__bindExtendedTools = function () {
        const $ = (id) => document.getElementById(id);

        $('btn-uuid').onclick = () => {
            $('out-uuid').value = crypto.randomUUID();
        };
        $('btn-uuid-5').onclick = () => {
            $('out-uuid').value = Array.from({ length: 5 }, () => crypto.randomUUID()).join('\n');
        };

        $('btn-random').onclick = () => {
            const lo = parseInt($('rand-lo').value, 10), hi = parseInt($('rand-hi').value, 10);
            if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo) { M('Enter a valid integer range'); return; }
            const n = Math.floor(Math.random() * (hi - lo + 1)) + lo;
            $('out-random').textContent = String(n);
        };

        const LOREM = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.';
        $('btn-lorem').onclick = () => {
            const n = Math.min(20, Math.max(1, parseInt($('lorem-n').value, 10) || 3));
            $('out-lorem').value = Array.from({ length: n }, () => LOREM).join('\n\n');
        };

        $('btn-b64-enc').onclick = () => {
            try {
                $('b64text-io').value = btoa(unescape(encodeURIComponent($('b64text-io').value)));
            } catch (e) { M('Encode failed — use valid Unicode text'); }
        };
        $('btn-b64-dec').onclick = () => {
            try {
                $('b64text-io').value = decodeURIComponent(escape(atob($('b64text-io').value.replace(/\s/g, ''))));
            } catch (e) { M('Decode failed — check Base64 is valid'); }
        };

        $('btn-hex-enc').onclick = () => {
            const enc = new TextEncoder().encode($('hex-io').value);
            $('hex-io').value = [...enc].map(b => b.toString(16).padStart(2, '0')).join('');
        };
        $('btn-hex-dec').onclick = () => {
            const h = $('hex-io').value.replace(/\s/g, '');
            if (h.length % 2) { M('Hex length must be even'); return; }
            const bytes = new Uint8Array(h.length / 2);
            for (let i = 0; i < h.length; i += 2) bytes[i / 2] = parseInt(h.slice(i, i + 2), 16);
            $('hex-io').value = new TextDecoder().decode(bytes);
        };

        $('btn-rot13').onclick = () => { $('rot13-io').value = rot13($('rot13-io').value); };

        $('btn-email').onclick = () => {
            const v = $('email-in').value.trim();
            const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
            $('email-out').innerHTML = ok ? '<span class="text-green-400">Looks valid</span>' : '<span class="text-red-400">Invalid format</span>';
        };

        $('btn-regex').onclick = () => {
            const pat = $('regex-pat').value, flags = $('regex-flags').value || '', text = $('regex-text').value;
            let re;
            try { re = new RegExp(pat, flags); } catch (e) { $('regex-out').textContent = 'Regex error: ' + e.message; return; }
            const m = text.match(re);
            $('regex-out').textContent = m ? JSON.stringify(m, null, 2) : 'No match';
        };

        $('btn-sortlines').onclick = () => {
            const ta = $('sortlines-io');
            ta.value = ta.value.split('\n').sort((a, b) => a.localeCompare(b)).join('\n');
        };

        $('btn-reverse').onclick = () => {
            const ta = $('reverse-io');
            ta.value = ta.value.split('').reverse().join('');
        };

        $('btn-dedupe').onclick = () => {
            const ta = $('dedupe-io');
            const seen = new Set();
            ta.value = ta.value.split('\n').filter(line => {
                if (seen.has(line)) return false;
                seen.add(line);
                return true;
            }).join('\n');
        };

        $('btn-slug').onclick = () => { $('slug-out').value = slugify($('slug-in').value); };

        $('btn-html-enc').onclick = () => {
            const d = document.createElement('div');
            d.textContent = $('htmlent-io').value;
            $('htmlent-io').value = d.innerHTML;
        };
        $('btn-html-dec').onclick = () => {
            const d = document.createElement('div');
            d.innerHTML = $('htmlent-io').value;
            $('htmlent-io').value = d.textContent;
        };

        $('btn-jwt').onclick = () => {
            try {
                const payload = parseJwt($('jwt-in').value);
                $('jwt-out').textContent = JSON.stringify(payload, null, 2);
            } catch (e) { $('jwt-out').textContent = 'Error: ' + e.message; }
        };

        $('btn-csv2json').onclick = () => {
            try { $('csvjson-io').value = JSON.stringify(simpleCsvToJson($('csvjson-io').value), null, 2); } catch (e) { M(e.message); }
        };
        $('btn-json2csv').onclick = () => {
            try {
                const arr = JSON.parse($('csvjson-io').value);
                if (!Array.isArray(arr)) { M('JSON must be an array of objects'); return; }
                $('csvjson-io').value = simpleJsonToCsv(arr);
            } catch (e) { M('JSON error — paste a JSON array of objects'); }
        };

        $('btn-radix').onclick = () => {
            const from = parseInt($('radix-from').value, 10), to = parseInt($('radix-to').value, 10);
            const inp = $('radix-in').value.trim();
            if (from < 2 || from > 36 || to < 2 || to > 36) { M('Radix must be 2–36'); return; }
            let n = parseInt(inp, from);
            if (Number.isNaN(n)) { M('Input does not match radix'); return; }
            $('radix-out').value = n.toString(to);
        };

        $('btn-utf8len').onclick = () => {
            const t = $('utf8-io').value;
            const bytes = new TextEncoder().encode(t).length;
            $('utf8-out').textContent = 'Characters: ' + t.length + ' · UTF-8 bytes: ' + bytes;
        };

        $('btn-jesc').onclick = () => {
            try { $('jescape-io').value = JSON.stringify($('jescape-io').value).slice(1, -1); } catch (e) { M('Escape failed — remove invalid characters'); }
        };
        $('btn-junesc').onclick = () => {
            const raw = $('jescape-io').value;
            try {
                $('jescape-io').value = JSON.parse('"' + raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"');
            } catch (e1) {
                try { $('jescape-io').value = JSON.parse('"' + raw + '"'); } catch (e2) { M('Paste valid JSON escapes (e.g. \\\\n)'); }
            }
        };

        (function initHttpSelect() {
            const sel = $('httpcode-in');
            if (!sel.options.length) {
                Object.keys(HTTP_CODES).sort((a, b) => +a - +b).forEach(code => {
                    const o = document.createElement('option');
                    o.value = code;
                    o.textContent = code + ' — ' + HTTP_CODES[code];
                    sel.appendChild(o);
                });
            }
            sel.addEventListener('change', () => {
                const c = parseInt(sel.value, 10);
                $('httpcode-out').textContent = HTTP_CODES[c] || '(see docs for nonstandard codes)';
            });
            sel.dispatchEvent(new Event('change'));
        })();

        let swStart = null, swAcc = 0, swId = null;
        $('btn-sw-start').onclick = () => {
            if (swId) return;
            swStart = Date.now() - swAcc;
            swId = setInterval(() => { $('sw-display').textContent = (Date.now() - swStart).toString(); }, 37);
        };
        $('btn-sw-pause').onclick = () => {
            if (swId) { swAcc = Date.now() - swStart; clearInterval(swId); swId = null; }
        };
        $('btn-sw-reset').onclick = () => {
            if (swId) clearInterval(swId);
            swId = null; swAcc = 0; swStart = null;
            $('sw-display').textContent = '0';
        };

        const ZONES = ['UTC', 'Asia/Shanghai', 'Asia/Tokyo', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Europe/Paris'];
        function fillWorldZones() {
            const sel = $('worldzone');
            sel.innerHTML = '';
            const list = typeof Intl !== 'undefined' && typeof Intl.supportedValuesOf === 'function'
                ? Intl.supportedValuesOf('timeZone').slice(0, 80)
                : ZONES;
            list.forEach(z => { const o = document.createElement('option'); o.value = z; o.textContent = z; sel.appendChild(o); });
        }
        fillWorldZones();
        function tickWorld() {
            const z = $('worldzone').value;
            try {
                $('worldtime-out').textContent = new Intl.DateTimeFormat('en-GB', {
                    timeZone: z, dateStyle: 'full', timeStyle: 'medium'
                }).format(new Date());
            } catch (e) { $('worldtime-out').textContent = 'Invalid time zone'; }
        }
        $('worldzone').onchange = tickWorld;
        setInterval(tickWorld, 1000);
        tickWorld();

        $('btn-age').onclick = () => {
            const d = new Date($('age-birth').value);
            if (Number.isNaN(d.getTime())) { M('Pick a birth date'); return; }
            const now = new Date();
            let y = now.getFullYear() - d.getFullYear(), m = now.getMonth() - d.getMonth(), day = now.getDate() - d.getDate();
            if (day < 0) { m--; }
            if (m < 0) { y--; m += 12; }
            $('age-out').textContent = 'About ' + y + ' years old';
        };

        $('btn-bmi').onclick = () => {
            const kg = parseFloat($('bmi-kg').value), m = parseFloat($('bmi-m').value);
            if (!kg || !m) { M('Enter weight (kg) and height (m)'); return; }
            const bmi = kg / (m * m);
            let cat = 'Underweight';
            if (bmi >= 30) cat = 'Obese';
            else if (bmi >= 25) cat = 'Overweight';
            else if (bmi >= 18.5) cat = 'Normal';
            $('bmi-out').textContent = 'BMI ' + bmi.toFixed(1) + ' (' + cat + ', informational only)';
        };

        $('btn-tip').onclick = () => {
            const bill = parseFloat($('tip-bill').value), pct = parseFloat($('tip-pct').value), n = Math.max(1, parseInt($('tip-people').value, 10) || 1);
            if (!Number.isFinite(bill) || !Number.isFinite(pct)) { M('Enter bill and tip percent'); return; }
            const tip = bill * pct / 100, total = bill + tip;
            $('tip-out').textContent = 'Tip ' + tip.toFixed(2) + ' · Total ' + total.toFixed(2) + ' · Per person ' + (total / n).toFixed(2);
        };

        $('btn-loan').onclick = () => {
            const P = parseFloat($('loan-p').value), years = parseFloat($('loan-years').value);
            const apr = parseFloat($('loan-apr').value) / 100 / 12;
            const n = Math.round(years * 12);
            if (!P || !n || apr < 0) { M('Enter principal, years, and APR'); return; }
            const pay = apr === 0 ? P / n : P * apr * Math.pow(1 + apr, n) / (Math.pow(1 + apr, n) - 1);
            $('loan-out').textContent = 'About ' + pay.toFixed(2) + ' / month (amortized estimate)';
        };

        $('btn-compound').onclick = () => {
            const P = parseFloat($('co-p').value), r = parseFloat($('co-r').value) / 100, t = parseFloat($('co-t').value), k = parseFloat($('co-k').value) || 1;
            if (!Number.isFinite(P) || !Number.isFinite(r) || !Number.isFinite(t)) { M('Enter principal, rate, and years'); return; }
            const A = P * Math.pow(1 + r / k, k * t);
            $('co-out').textContent = 'Future value ≈ ' + A.toFixed(2);
        };

        $('btn-roman-enc').onclick = () => {
            const n = parseInt($('roman-in').value, 10);
            $('roman-out').value = n >= 1 && n <= 3999 ? romanize(n) : 'Enter 1–3999';
        };
        $('btn-roman-dec').onclick = () => {
            const n = romanFromStr($('roman-in').value);
            $('roman-out').value = Number.isFinite(n) && n > 0 ? String(n) : 'Cannot parse';
        };

        $('btn-diff').onclick = () => {
            const a = $('diff-a').value.split('\n'), b = $('diff-b').value.split('\n');
            const max = Math.max(a.length, b.length);
            const lines = [];
            for (let i = 0; i < max; i++) {
                const la = a[i] ?? '', lb = b[i] ?? '';
                if (la === lb) lines.push('  ' + la);
                else { if (la) lines.push('- ' + la); if (lb) lines.push('+ ' + lb); }
            }
            $('diff-out').value = lines.join('\n');
        };

        $('btn-striphtml').onclick = () => {
            $('striphtml-io').value = $('striphtml-io').value.replace(/<[^>]+>/g, '');
        };

        $('btn-linenum').onclick = () => {
            const ta = $('linenum-io');
            ta.value = ta.value.split('\n').map((line, i) => (i + 1) + '\t' + line).join('\n');
        };

        $('btn-randline').onclick = () => {
            const lines = $('randline-io').value.split('\n').filter(l => l.length);
            $('randline-out').textContent = lines.length ? lines[Math.floor(Math.random() * lines.length)] : '(no lines)';
        };

        $('btn-repeat').onclick = () => {
            const s = $('repeat-s').value, n = Math.min(5000, Math.max(0, parseInt($('repeat-n').value, 10) || 0));
            $('repeat-out').value = s.repeat(n);
        };

        $('btn-pad').onclick = () => {
            const s = $('pad-s').value, len = parseInt($('pad-len').value, 10), ch = ($('pad-ch').value || ' ').slice(0, 1);
            const left = $('pad-left').checked;
            $('pad-out').value = left ? s.padStart(len, ch) : s.padEnd(len, ch);
        };

        $('btn-exturl').onclick = () => {
            const m = $('exturl-io').value.match(/https?:\/\/[^\s"'<>]+/gi) || [];
            $('exturl-out').value = [...new Set(m)].join('\n');
        };

        $('btn-extemail').onclick = () => {
            const m = $('extemail-io').value.match(/[^\s@]+@[^\s@]+\.[^\s@]+/g) || [];
            $('extemail-out').value = [...new Set(m)].join('\n');
        };

        $('btn-metagen').onclick = () => {
            const t = $('meta-title').value, d = $('meta-desc').value, u = $('meta-url').value || 'https://ygunoil-ai-tools-hub.vercel.app/';
            $('meta-out').value = [
                '<title>' + escapeHtml(t) + '</title>',
                '<meta name="description" content="' + escapeAttr(d) + '">',
                '<meta property="og:title" content="' + escapeAttr(t) + '">',
                '<meta property="og:description" content="' + escapeAttr(d) + '">',
                '<meta property="og:url" content="' + escapeAttr(u) + '">',
                '<link rel="canonical" href="' + escapeAttr(u) + '">'
            ].join('\n');
        };
        function escapeHtml(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
        function escapeAttr(s) { return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;'); }

        $('btn-wordwrap').onclick = () => {
            const w = Math.max(10, parseInt($('wrap-w').value, 10) || 40);
            const text = $('wrap-io').value.replace(/\r/g, '');
            const paras = text.split(/\n\n+/);
            $('wrap-out').value = paras.map(p => wrapPara(p, w)).join('\n\n');
        };
        function wrapPara(p, w) {
            const words = p.replace(/\n/g, ' ').split(/\s+/).filter(Boolean);
            const lines = [];
            let cur = '';
            words.forEach(word => {
                if ((cur + ' ' + word).trim().length <= w) cur = (cur + ' ' + word).trim();
                else { if (cur) lines.push(cur); cur = word; }
            });
            if (cur) lines.push(cur);
            return lines.join('\n');
        }

        $('btn-round').onclick = () => {
            const x = parseFloat($('round-x').value), d = parseInt($('round-d').value, 10) || 0;
            if (!Number.isFinite(x)) { M('Enter a number'); return; }
            const f = Math.pow(10, d);
            $('round-out').textContent = String(Math.round(x * f) / f);
        };

        $('btn-shades').onclick = () => {
            const rgb = parseHexRgb($('shades-base').value);
            const box = $('shades-out');
            if (!rgb) { M('Invalid HEX'); return; }
            box.innerHTML = '';
            const { r, g, b } = rgb;
            for (let i = -5; i <= 5; i++) {
                const f = 1 + i * 0.12;
                const nr = Math.min(255, Math.max(0, Math.round(r * f)));
                const ng = Math.min(255, Math.max(0, Math.round(g * f)));
                const nb = Math.min(255, Math.max(0, Math.round(b * f)));
                const hx = '#' + [nr, ng, nb].map(x => x.toString(16).padStart(2, '0')).join('');
                const d = document.createElement('div');
                d.className = 'h-12 w-12 shrink-0 rounded border border-gray-600';
                d.style.background = hx;
                d.title = hx;
                box.appendChild(d);
            }
        };

    };
})();
