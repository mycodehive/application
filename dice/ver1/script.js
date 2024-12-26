document.getElementById("dice-area").addEventListener("click", () => {
    const diceImage = document.getElementById("dice-image");
    let rollCount = 0;
  
    const interval = setInterval(() => {
      const randomDice = Math.floor(Math.random() * 6) + 1;
      diceImage.src = `img/dice-${randomDice}-rmbg.png`; // 주사위 이미지 변경
      rollCount++;
      if (rollCount > 5) { // 0.5초 동안 100ms 간격으로 반복
        clearInterval(interval);
      }
    }, 100); // 이미지 변경 간격 100ms
  });
  