document.addEventListener("DOMContentLoaded", () => {
  let diceCount = 1;

  const diceContainer = document.getElementById("dice-container");
  const diceCountDisplay = document.getElementById("dice-count");
  const increaseDiceButton = document.getElementById("increase-dice");
  const decreaseDiceButton = document.getElementById("decrease-dice");
  const diceArea = document.getElementById("dice-area");

  // 주사위 합계를 표시할 엘리먼트 추가
  const diceSumDisplay = document.createElement("div");
  diceSumDisplay.id = "dice-sum";
  diceSumDisplay.textContent = "0";
  diceContainer.parentNode.appendChild(diceSumDisplay);

  // 주사위 UI 업데이트
  function updateDiceUI() {
    diceContainer.innerHTML = ""; // 기존 주사위 초기화
    for (let i = 0; i < diceCount; i++) {
      const dice = document.createElement("div");
      dice.classList.add("dice");
      const diceImg = document.createElement("img");
      diceImg.src = "../img/dice-1.png"; // 초기 주사위 이미지
      diceImg.alt = "Dice";
      dice.appendChild(diceImg);
      diceContainer.appendChild(dice);
    }
    updateDiceSum(0); // 합계 초기화
  }

  // 주사위 결과 표시 및 합계 계산
  function rollDice() {
    const diceElements = document.querySelectorAll(".dice img");
    let totalSum = 0;

    // 각 주사위를 0.5초 동안 실시간으로 변경
    diceElements.forEach(dice => {
      let interval = setInterval(() => {
        const randomNumber = Math.floor(Math.random() * 6) + 1; // 1 ~ 6 랜덤 숫자
        dice.src = `../img/dice-${randomNumber}.png`; // 주사위 이미지 변경
      }, 100); // 0.1초마다 변경

      // 0.5초 후에 멈추도록 설정
      setTimeout(() => {
        clearInterval(interval);
        const finalNumber = Math.floor(Math.random() * 6) + 1; // 최종 랜덤 숫자
        dice.src = `../img/dice-${finalNumber}.png`; // 최종 주사위 이미지
        totalSum += finalNumber;
        if (totalSum > 0) {
          updateDiceSum(totalSum); // 합계 업데이트
        }
      }, 500); // 0.5초 후 멈춤
    });
  }

  // 합계 업데이트 함수
  function updateDiceSum(sum) {
    diceSumDisplay.textContent = sum > 0 ? `${sum}` : "";
  }

  // 주사위 개수 증가
  increaseDiceButton.addEventListener("click", () => {
    diceCount++;
    diceCountDisplay.textContent = diceCount;
    updateDiceUI();
  });

  // 주사위 개수 감소
  decreaseDiceButton.addEventListener("click", () => {
    if (diceCount > 1) {
      diceCount--;
      diceCountDisplay.textContent = diceCount;
      updateDiceUI();
    }
  });

  // 화면 터치 시 주사위 굴리기
  diceArea.addEventListener("click", rollDice);

  // 초기 주사위 UI 설정
  updateDiceUI();
});
