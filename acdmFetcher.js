// acdmFetcher.js
const { createParser } = require('eventsource-parser');

const ACDM_API_URL = process.env.ACDM_API_URL || 'https://api.vclvacc.net/api/v1/pilots/sse';

/**
 * Lấy danh sách flight từ ACDM qua SSE.
 * @returns {Promise<Array|null>}
 */
async function fetchFlights() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 giờ thay vì 15

  try {
    const response = await fetch(ACDM_API_URL, {
      headers: {
        'User-Agent': 'VCLvACC-Bot/1.0',
        'Accept': 'text/event-stream', // Quan trọng để server gửi đúng định dạng SSE
      },
      signal: controller.signal,
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    let flightsData = null;

    const parser = createParser({
      onEvent: (event) => {
        console.log(`[ACDM Debug] Received event type: ${event.type}, event name: ${event.event || 'none'}`);
        if (event.type === 'event' && event.event === 'pilot:sync') {
          try {
            flightsData = JSON.parse(event.data);
            console.log(`[ACDM Debug] Successfully parsed pilot:sync with ${flightsData.length} flights`);
          } catch (err) {
            console.error('Lỗi parse JSON từ pilot:sync:', err.message);
          }
        }
      }
    });

    const reader = response.body.getReader();
    let result;
    while (!(result = await reader.read()).done) {
      const chunk = new TextDecoder().decode(result.value);
      parser.feed(chunk);
      if (flightsData) break; // thoát sớm khi có dữ liệu
    }

    clearTimeout(timeoutId);
    controller.abort();

    if (!flightsData || !Array.isArray(flightsData)) {
      console.warn('Không nhận được mảng flights từ ACDM.');
      return null;
    }

    // Map sang các trường cần thiết
    const flights = flightsData.map(flight => ({
      callsign: flight.callsign,
      adep: flight.adep,
      ades: flight.ades,
      tobt: flight.tobt,
      tsat: flight.tsat,
      ttot: flight.ttot,
      ardt: flight.ardt,
      asrt: flight.asrt,
      asat: flight.asat,
      ctot: flight.ctot,
    }));

    console.log(`✅ Đã lấy ${flights.length} flights từ ACDM`);
    return flights;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.error('ACDM fetch timeout – không nhận được pilot:sync kịp thời (30s).');
    } else {
      console.error('ACDM fetcher error:', err.message);
    }
    return null;
  }
}

/**
 * Hàm giữ nguyên để tương thích với index.js
 */
async function fetchFlightsFromAPI() {
  return fetchFlights();
}

module.exports = { fetchFlights, fetchFlightsFromAPI };