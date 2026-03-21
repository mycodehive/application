let watchId;
let maxSpeed = 0;
let startTime;
let timerInterval;

function startTracking() {
  if (!navigator.geolocation) {
    alert("GPS를 지원하지 않는 브라우저입니다.");
    return;
  }

  startTime = Date.now();
  timerInterval = setInterval(updateTime, 1000);

  watchId = navigator.geolocation.watchPosition(position => {
    const speed = position.coords.speed || 0;
    const kmh = (speed * 3.6).toFixed(1);
    document.getElementById('speed').textContent = kmh;

    if (speed > maxSpeed) {
      maxSpeed = speed;
      document.getElementById('max-speed').textContent = (maxSpeed * 3.6).toFixed(1);
    }

    const altitude = position.coords.altitude;
    document.getElementById('altitude').textContent = altitude !== null ? altitude.toFixed(1) : '--';
  }, err => {
    alert("GPS 오류: " + err.message);
  }, {
    enableHighAccuracy: true
  });
}

function stopTracking() {
  navigator.geolocation.clearWatch(watchId);
  clearInterval(timerInterval);
}

function updateTime() {
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  const minutes = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const seconds = String(elapsed % 60).padStart(2, '0');
  document.getElementById('time').textContent = `${minutes}:${seconds}`;
}
