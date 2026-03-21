const map = L.map("map", {
  zoomControl: true,
  preferCanvas: true,
}).setView([37.5665, 126.978], 13);

L.maplibreGL({
  style: "https://tiles.openfreemap.org/styles/liberty",
}).addTo(map);

const elements = {
  mapStage: document.querySelector(".map-stage"),
  menuToggleBtn: document.getElementById("menu-toggle-btn"),
  menuCloseBtn: document.getElementById("menu-close-btn"),
  menuBackdrop: document.getElementById("menu-backdrop"),
  statusOverlay: document.querySelector(".map-status-overlay"),
  statusToggleBtn: document.getElementById("status-toggle-btn"),
  fileInput: document.getElementById("gpx-file"),
  fitRouteBtn: document.getElementById("fit-route-btn"),
  centerLocationBtn: document.getElementById("center-location-btn"),
  startNavBtn: document.getElementById("start-nav-btn"),
  stopNavBtn: document.getElementById("stop-nav-btn"),
  toggleHudBtn: document.getElementById("toggle-hud-btn"),
  voiceToggle: document.getElementById("voice-toggle"),
  quickActionBtn: document.getElementById("quick-action-btn"),
  quickActionLabel: document.getElementById("quick-action-label"),
  quickActionText: document.getElementById("quick-action-text"),
  routeName: document.getElementById("route-name"),
  navStateBadge: document.getElementById("nav-state-badge"),
  statusMessage: document.getElementById("status-message"),
  routeDistance: document.getElementById("route-distance"),
  remainingDistance: document.getElementById("remaining-distance"),
  offRouteDistance: document.getElementById("off-route-distance"),
  currentSpeed: document.getElementById("current-speed"),
  nextInstruction: document.getElementById("next-instruction"),
  nextGuideDistance: document.getElementById("next-guide-distance"),
  progressValue: document.getElementById("progress-value"),
  accuracyValue: document.getElementById("accuracy-value"),
  coordinateValue: document.getElementById("coordinate-value"),
  fileDrop: document.querySelector(".file-drop"),
};

const state = {
  routePoints: [],
  routeName: "",
  routeBounds: null,
  cumulativeDistances: [],
  segmentDistances: [],
  guidancePoints: [],
  totalDistance: 0,
  routeLine: null,
  progressLine: null,
  startMarker: null,
  endMarker: null,
  currentMarker: null,
  accuracyCircle: null,
  snapLine: null,
  watchId: null,
  currentPosition: null,
  matchedRoute: null,
  lastAnnouncementKey: "",
  hudHidden: false,
};

const mobileMenuQuery = window.matchMedia("(max-width: 1100px)");
const compactStatusQuery = window.matchMedia("(max-width: 720px)");

function setMenuOpen(open) {
  const shouldOpen = mobileMenuQuery.matches ? open : false;
  document.body.classList.toggle("menu-open", shouldOpen);
  elements.menuBackdrop.hidden = !shouldOpen;
  elements.menuToggleBtn.setAttribute("aria-expanded", String(shouldOpen));

  requestAnimationFrame(() => {
    map.invalidateSize();
  });
}

function setStatusPanelCollapsed(collapsed) {
  const shouldCollapse = compactStatusQuery.matches ? collapsed : false;
  elements.statusOverlay.classList.toggle("collapsed", shouldCollapse);
  elements.statusToggleBtn.textContent = shouldCollapse ? "펼치기" : "접기";
  elements.statusToggleBtn.setAttribute("aria-expanded", String(!shouldCollapse));
}

function setHudHidden(hidden) {
  state.hudHidden = hidden;
  elements.mapStage.classList.toggle("hud-hidden", hidden);
  elements.toggleHudBtn.textContent = hidden ? "지도 정보 표시" : "지도 정보 숨기기";
  elements.toggleHudBtn.classList.toggle("is-active", hidden);
  elements.toggleHudBtn.setAttribute("aria-pressed", String(hidden));

  requestAnimationFrame(() => {
    map.invalidateSize();
  });
}

function updateQuickActionButton() {
  const hasRoute = state.routePoints.length > 0;
  const isLive = state.watchId !== null;

  elements.quickActionBtn.classList.remove("ready", "live");

  if (!hasRoute) {
    elements.quickActionLabel.textContent = "현재 모드";
    elements.quickActionText.textContent = "GPX 업로드";
    elements.quickActionBtn.disabled = true;
    return;
  }

  elements.quickActionBtn.disabled = false;

  if (isLive) {
    elements.quickActionLabel.textContent = "안내 상태";
    elements.quickActionText.textContent = "안내 중지";
    elements.quickActionBtn.classList.add("live");
    return;
  }

  elements.quickActionLabel.textContent = "안내";
  elements.quickActionText.textContent = "안내 시작";
  elements.quickActionBtn.classList.add("ready");
}

function setStatus(message, mode = "idle") {
  elements.statusMessage.textContent = message;

  elements.navStateBadge.className = `state-badge ${mode}`;
  elements.navStateBadge.textContent = {
    idle: "대기",
    ready: "준비",
    live: "실행",
    alert: "경고",
  }[mode] || "대기";
}

function formatDistance(meters) {
  if (!Number.isFinite(meters)) {
    return "-";
  }

  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km`;
  }

  return `${Math.round(meters)} m`;
}

function formatSpeed(mps) {
  if (!Number.isFinite(mps) || mps < 0) {
    return "-";
  }

  return `${(mps * 3.6).toFixed(1)} km/h`;
}

function formatCoords(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return "-";
  }

  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

function toRad(value) {
  return (value * Math.PI) / 180;
}

function toDeg(value) {
  return (value * 180) / Math.PI;
}

function haversine(a, b) {
  const radius = 6371000;
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLat = lat2 - lat1;
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * radius * Math.asin(Math.sqrt(h));
}

function normalizeBearing(value) {
  return (value % 360 + 360) % 360;
}

function bearingBetween(a, b) {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  return normalizeBearing(toDeg(Math.atan2(y, x)));
}

function signedBearingDifference(from, to) {
  return ((to - from + 540) % 360) - 180;
}

function directionLabel(angle) {
  if (angle > 30) {
    return "오른쪽";
  }
  if (angle < -30) {
    return "왼쪽";
  }
  return "직진";
}

function parsePoint(node) {
  return {
    lat: Number.parseFloat(node.getAttribute("lat")),
    lng: Number.parseFloat(node.getAttribute("lon")),
    ele: Number.parseFloat(node.querySelector("ele")?.textContent ?? "NaN"),
  };
}

function parseGpx(text) {
  const xml = new DOMParser().parseFromString(text, "application/xml");
  const parserError = xml.querySelector("parsererror");

  if (parserError) {
    throw new Error("GPX 파일을 파싱할 수 없습니다.");
  }

  const trackPoints = Array.from(xml.querySelectorAll("trkpt")).map(parsePoint);
  const routePoints = Array.from(xml.querySelectorAll("rtept")).map(parsePoint);
  const points = trackPoints.length >= 2 ? trackPoints : routePoints;

  if (points.length < 2) {
    throw new Error("GPX 안에 표시 가능한 트랙 또는 경로 좌표가 충분하지 않습니다.");
  }

  const routeName =
    xml.querySelector("trk > name")?.textContent?.trim() ||
    xml.querySelector("rte > name")?.textContent?.trim() ||
    xml.querySelector("metadata > name")?.textContent?.trim() ||
    "불러온 GPX 경로";

  return { points, routeName };
}

function computeRouteMetrics(points) {
  const cumulative = [0];
  const segments = [];
  let total = 0;

  for (let index = 1; index < points.length; index += 1) {
    const distance = haversine(points[index - 1], points[index]);
    total += distance;
    segments.push(distance);
    cumulative.push(total);
  }

  return { cumulative, segments, total };
}

function buildGuidancePoints(points, cumulative) {
  const guidance = [{
    index: 0,
    progress: 0,
    type: "start",
    turn: 0,
  }];
  let lastGuideDistance = 0;

  for (let index = 1; index < points.length - 1; index += 1) {
    const incoming = bearingBetween(points[index - 1], points[index]);
    const outgoing = bearingBetween(points[index], points[index + 1]);
    const turn = signedBearingDifference(incoming, outgoing);
    const distanceSinceLastGuide = cumulative[index] - lastGuideDistance;

    if (Math.abs(turn) >= 30 || distanceSinceLastGuide >= 300) {
      guidance.push({
        index,
        progress: cumulative[index],
        type: Math.abs(turn) >= 30 ? "turn" : "continue",
        turn,
      });
      lastGuideDistance = cumulative[index];
    }
  }

  guidance.push({
    index: points.length - 1,
    progress: cumulative[cumulative.length - 1],
    type: "finish",
    turn: 0,
  });

  return guidance;
}

function clearRouteLayers() {
  [
    "routeLine",
    "progressLine",
    "startMarker",
    "endMarker",
    "snapLine",
    "currentMarker",
    "accuracyCircle",
  ].forEach((key) => {
    if (state[key]) {
      map.removeLayer(state[key]);
      state[key] = null;
    }
  });
}

function drawRoute() {
  clearRouteLayers();

  const latLngs = state.routePoints.map((point) => [point.lat, point.lng]);
  state.routeLine = L.polyline(latLngs, {
    color: "#4fd1c5",
    weight: 5,
    opacity: 0.92,
  }).addTo(map);

  state.progressLine = L.polyline([], {
    color: "#f5f7ff",
    weight: 7,
    opacity: 0.92,
    lineCap: "round",
  }).addTo(map);

  state.startMarker = L.circleMarker(latLngs[0], {
    radius: 7,
    color: "#4fd1c5",
    fillColor: "#4fd1c5",
    fillOpacity: 1,
    weight: 2,
  }).bindPopup("출발 지점").addTo(map);

  state.endMarker = L.circleMarker(latLngs[latLngs.length - 1], {
    radius: 7,
    color: "#ffb454",
    fillColor: "#ffb454",
    fillOpacity: 1,
    weight: 2,
  }).bindPopup("도착 지점").addTo(map);

  state.routeBounds = L.latLngBounds(latLngs);
  map.fitBounds(state.routeBounds.pad(0.12));
}

function resetNavigationUi() {
  elements.remainingDistance.textContent = state.totalDistance ? formatDistance(state.totalDistance) : "-";
  elements.offRouteDistance.textContent = "-";
  elements.currentSpeed.textContent = "-";
  elements.nextInstruction.textContent = "안내 준비 중";
  elements.nextGuideDistance.textContent = "-";
  elements.progressValue.textContent = "0%";
  elements.accuracyValue.textContent = "-";
  elements.coordinateValue.textContent = "-";
}

function loadRoute(routeData) {
  stopNavigation();

  state.routePoints = routeData.points;
  state.routeName = routeData.routeName;

  const metrics = computeRouteMetrics(routeData.points);
  state.cumulativeDistances = metrics.cumulative;
  state.segmentDistances = metrics.segments;
  state.totalDistance = metrics.total;
  state.guidancePoints = buildGuidancePoints(routeData.points, metrics.cumulative);
  state.matchedRoute = null;
  state.lastAnnouncementKey = "";

  drawRoute();
  resetNavigationUi();

  elements.routeName.textContent = state.routeName;
  elements.routeDistance.textContent = formatDistance(state.totalDistance);
  elements.remainingDistance.textContent = formatDistance(state.totalDistance);

  setStatus("경로를 불러왔습니다. 실시간 안내를 시작할 수 있습니다.", "ready");
  updateQuickActionButton();
}

function projectToMeters(point, refLat) {
  const metersPerDegLat = 111320;
  const metersPerDegLng = 111320 * Math.cos(toRad(refLat));
  return {
    x: point.lng * metersPerDegLng,
    y: point.lat * metersPerDegLat,
  };
}

function findNearestPointOnRoute(position) {
  if (state.routePoints.length < 2) {
    return null;
  }

  const refLat = position.lat;
  const projected = projectToMeters(position, refLat);
  let bestMatch = null;

  for (let index = 0; index < state.routePoints.length - 1; index += 1) {
    const aPoint = state.routePoints[index];
    const bPoint = state.routePoints[index + 1];
    const a = projectToMeters(aPoint, refLat);
    const b = projectToMeters(bPoint, refLat);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy || 1;
    const t = Math.min(1, Math.max(0, ((projected.x - a.x) * dx + (projected.y - a.y) * dy) / lengthSq));
    const nearest = {
      x: a.x + dx * t,
      y: a.y + dy * t,
    };
    const distance = Math.hypot(projected.x - nearest.x, projected.y - nearest.y);
    const progress = state.cumulativeDistances[index] + state.segmentDistances[index] * t;
    const nearestLat = aPoint.lat + (bPoint.lat - aPoint.lat) * t;
    const nearestLng = aPoint.lng + (bPoint.lng - aPoint.lng) * t;

    if (!bestMatch || distance < bestMatch.distance) {
      bestMatch = {
        distance,
        progress,
        segmentIndex: index,
        snapped: {
          lat: nearestLat,
          lng: nearestLng,
        },
      };
    }
  }

  return bestMatch;
}

function getNextGuidance(progress) {
  return state.guidancePoints.find((guide) => guide.progress > progress + 10) ||
    state.guidancePoints[state.guidancePoints.length - 1];
}

function buildInstruction(match, position) {
  const remaining = Math.max(0, state.totalDistance - match.progress);
  const nextGuide = getNextGuidance(match.progress);
  const distanceToGuide = Math.max(0, nextGuide.progress - match.progress);
  const offRouteThreshold = Math.max(20, (position.accuracy || 0) * 1.5);

  if (remaining <= 20) {
    return {
      text: "목적지에 거의 도착했습니다.",
      guideDistance: 0,
      mode: "ready",
      speechKey: "arrive",
      speechText: "목적지에 거의 도착했습니다.",
    };
  }

  if (match.distance > offRouteThreshold) {
    return {
      text: `경로에서 ${formatDistance(match.distance)} 벗어났습니다. 표시된 경로로 복귀하세요.`,
      guideDistance: distanceToGuide,
      mode: "alert",
      speechKey: `off-route-${Math.round(match.distance / 10)}`,
      speechText: "경로를 벗어났습니다. 경로로 복귀하세요.",
    };
  }

  if (nextGuide.type === "finish") {
    return {
      text: `${formatDistance(remaining)} 후 목적지입니다.`,
      guideDistance: remaining,
      mode: "live",
      speechKey: remaining < 80 ? "finish-near" : "",
      speechText: "곧 목적지입니다.",
    };
  }

  if (nextGuide.type === "turn") {
    const turnText = directionLabel(nextGuide.turn);
    return {
      text: `${formatDistance(distanceToGuide)} 앞에서 ${turnText}으로 진행하세요.`,
      guideDistance: distanceToGuide,
      mode: "live",
      speechKey: `turn-${nextGuide.index}`,
      speechText: `${formatDistance(distanceToGuide)} 앞에서 ${turnText}으로 진행하세요.`,
    };
  }

  const routeBearing = bearingBetween(position, state.routePoints[nextGuide.index]);
  const heading = Number.isFinite(position.heading) ? position.heading : null;
  const leadText = heading === null
    ? `${Math.round(routeBearing)}도 방향으로 계속 진행하세요.`
    : `${directionLabel(signedBearingDifference(heading, routeBearing))} 방향으로 계속 진행하세요.`;

  return {
    text: `${formatDistance(distanceToGuide)} 구간 동안 ${leadText}`,
    guideDistance: distanceToGuide,
    mode: "live",
    speechKey: "",
    speechText: "",
  };
}

function announceInstruction(instruction) {
  if (!elements.voiceToggle.checked || !window.speechSynthesis) {
    return;
  }

  if (!instruction.speechKey || instruction.speechKey === state.lastAnnouncementKey) {
    return;
  }

  state.lastAnnouncementKey = instruction.speechKey;
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(instruction.speechText);
  utterance.lang = "ko-KR";
  utterance.rate = 1.02;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

function updateCurrentLocationLayers(position, match) {
  const latLng = [position.lat, position.lng];

  if (!state.currentMarker) {
    state.currentMarker = L.circleMarker(latLng, {
      radius: 8,
      color: "#f5f7ff",
      fillColor: "#ffffff",
      fillOpacity: 1,
      weight: 3,
    }).addTo(map);
  } else {
    state.currentMarker.setLatLng(latLng);
  }

  if (!state.accuracyCircle) {
    state.accuracyCircle = L.circle(latLng, {
      radius: position.accuracy || 0,
      color: "#7fb8ff",
      weight: 1.5,
      opacity: 0.7,
      fillColor: "#7fb8ff",
      fillOpacity: 0.12,
    }).addTo(map);
  } else {
    state.accuracyCircle.setLatLng(latLng);
    state.accuracyCircle.setRadius(position.accuracy || 0);
  }

  if (!state.snapLine) {
    state.snapLine = L.polyline([], {
      color: "#ffffff",
      weight: 2,
      opacity: 0.75,
      dashArray: "8 8",
    }).addTo(map);
  }

  state.snapLine.setLatLngs([
    latLng,
    [match.snapped.lat, match.snapped.lng],
  ]);

  const progressCoordinates = [];
  for (let index = 0; index <= match.segmentIndex; index += 1) {
    progressCoordinates.push([state.routePoints[index].lat, state.routePoints[index].lng]);
  }
  progressCoordinates.push([match.snapped.lat, match.snapped.lng]);
  state.progressLine.setLatLngs(progressCoordinates);
}

function updateUiWithPosition(position, match, instruction) {
  const remaining = Math.max(0, state.totalDistance - match.progress);
  const progressPercent = state.totalDistance > 0 ? (match.progress / state.totalDistance) * 100 : 0;

  elements.remainingDistance.textContent = formatDistance(remaining);
  elements.offRouteDistance.textContent = formatDistance(match.distance);
  elements.currentSpeed.textContent = formatSpeed(position.speed);
  elements.nextInstruction.textContent = instruction.text;
  elements.nextGuideDistance.textContent = formatDistance(instruction.guideDistance);
  elements.progressValue.textContent = `${progressPercent.toFixed(1)}%`;
  elements.accuracyValue.textContent = formatDistance(position.accuracy);
  elements.coordinateValue.textContent = formatCoords(position.lat, position.lng);
}

function handlePositionUpdate(geoPosition) {
  const position = {
    lat: geoPosition.coords.latitude,
    lng: geoPosition.coords.longitude,
    accuracy: geoPosition.coords.accuracy,
    heading: geoPosition.coords.heading,
    speed: geoPosition.coords.speed,
  };

  state.currentPosition = position;
  const match = findNearestPointOnRoute(position);

  if (!match) {
    setStatus("경로를 먼저 불러오세요.", "idle");
    return;
  }

  state.matchedRoute = match;
  updateCurrentLocationLayers(position, match);

  const instruction = buildInstruction(match, position);
  updateUiWithPosition(position, match, instruction);
  announceInstruction(instruction);
  setStatus("현재 위치를 추적하며 실시간 안내 중입니다.", instruction.mode);
}

function startNavigation() {
  if (!state.routePoints.length) {
    setStatus("안내를 시작하려면 GPX 경로를 먼저 불러오세요.", "idle");
    return;
  }

  if (!navigator.geolocation) {
    setStatus("이 브라우저는 위치 추적을 지원하지 않습니다.", "alert");
    return;
  }

  stopNavigation(false);
  state.lastAnnouncementKey = "";

  state.watchId = navigator.geolocation.watchPosition(handlePositionUpdate, (error) => {
    const message = {
      1: "위치 권한이 거부되었습니다. 브라우저 권한을 확인하세요.",
      2: "현재 위치를 가져올 수 없습니다.",
      3: "위치 확인 시간이 초과되었습니다.",
    }[error.code] || "위치 추적을 시작할 수 없습니다.";

    setStatus(message, "alert");
  }, {
    enableHighAccuracy: true,
    maximumAge: 1000,
    timeout: 15000,
  });

  elements.startNavBtn.disabled = true;
  elements.stopNavBtn.disabled = false;
  setStatus("GPS 신호를 기다리는 중입니다.", "live");
  updateQuickActionButton();
}

function stopNavigation(resetStatus = true) {
  if (state.watchId !== null) {
    navigator.geolocation.clearWatch(state.watchId);
    state.watchId = null;
  }

  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }

  elements.startNavBtn.disabled = false;
  elements.stopNavBtn.disabled = true;

  if (resetStatus && state.routePoints.length) {
    setStatus("실시간 안내가 중지되었습니다. 다시 시작할 수 있습니다.", "ready");
  } else if (resetStatus) {
    setStatus("GPX 파일을 먼저 불러오세요.", "idle");
  }

  updateQuickActionButton();
}

async function readRouteFile(file) {
  const text = await file.text();
  const routeData = parseGpx(text);
  loadRoute(routeData);
}

function fitRoute() {
  if (state.routeBounds) {
    map.fitBounds(state.routeBounds.pad(0.12));
  }
}

function centerCurrentLocation() {
  if (state.currentPosition) {
    map.flyTo([state.currentPosition.lat, state.currentPosition.lng], Math.max(map.getZoom(), 16), {
      duration: 0.8,
    });
    return;
  }

  if (state.routeBounds) {
    fitRoute();
  }
}

function handleFileSelection(file) {
  if (!file) {
    return;
  }

  readRouteFile(file).catch((error) => {
    console.error(error);
    setStatus(error.message || "GPX 파일을 불러오는 중 오류가 발생했습니다.", "alert");
  });
}

elements.fileInput.addEventListener("change", (event) => {
  handleFileSelection(event.target.files?.[0]);
});

elements.menuToggleBtn.addEventListener("click", () => {
  setMenuOpen(true);
});

elements.menuCloseBtn.addEventListener("click", () => {
  setMenuOpen(false);
});

elements.menuBackdrop.addEventListener("click", () => {
  setMenuOpen(false);
});

elements.toggleHudBtn.addEventListener("click", () => {
  setHudHidden(!state.hudHidden);
  if (mobileMenuQuery.matches) {
    setMenuOpen(false);
  }
});

elements.statusToggleBtn.addEventListener("click", () => {
  const isCollapsed = elements.statusOverlay.classList.contains("collapsed");
  setStatusPanelCollapsed(!isCollapsed);
});

elements.quickActionBtn.addEventListener("click", () => {
  if (state.watchId !== null) {
    stopNavigation(true);
    return;
  }

  startNavigation();
});

mobileMenuQuery.addEventListener("change", () => {
  if (!mobileMenuQuery.matches) {
    setMenuOpen(false);
    return;
  }

  map.invalidateSize();
});

compactStatusQuery.addEventListener("change", () => {
  setStatusPanelCollapsed(compactStatusQuery.matches);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && document.body.classList.contains("menu-open")) {
    setMenuOpen(false);
  }
});

elements.fitRouteBtn.addEventListener("click", fitRoute);
elements.centerLocationBtn.addEventListener("click", centerCurrentLocation);
elements.startNavBtn.addEventListener("click", () => {
  startNavigation();
  if (mobileMenuQuery.matches) {
    setMenuOpen(false);
  }
});
elements.stopNavBtn.addEventListener("click", () => stopNavigation(true));

["dragenter", "dragover"].forEach((eventName) => {
  elements.fileDrop.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.fileDrop.classList.add("drag-over");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  elements.fileDrop.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.fileDrop.classList.remove("drag-over");
  });
});

elements.fileDrop.addEventListener("drop", (event) => {
  const [file] = event.dataTransfer?.files || [];
  handleFileSelection(file);
});

resetNavigationUi();
setMenuOpen(false);
setStatus("GPX 파일을 먼저 불러오세요.", "idle");
updateQuickActionButton();
setStatusPanelCollapsed(compactStatusQuery.matches);
setHudHidden(false);
