(() => {
  const changeMode = (dark) => {
    if (dark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };
  const query = "(prefers-color-scheme: dark)";
  document.addEventListener("DOMContentLoaded", () => {
    changeMode(window.matchMedia(query).matches);
  });
  window.matchMedia(query).addEventListener("change", (event) => {
    changeMode(event.matches);
  });
})();
