const toggleButtons = document.querySelectorAll("[data-visual-toggle]");

for (const button of toggleButtons) {
  const targetSelector = button.getAttribute("data-visual-target");
  if (!targetSelector) continue;

  const target = document.querySelector(targetSelector);
  if (!target) continue;

  const showLabel = button.getAttribute("data-show-label") || "Show Game Screen";
  const hideLabel = button.getAttribute("data-hide-label") || "Hide Game Screen";

  const applyState = (isHidden) => {
    target.hidden = isHidden;
    button.textContent = isHidden ? showLabel : hideLabel;
    button.setAttribute("aria-expanded", isHidden ? "false" : "true");
  };

  applyState(false);

  button.addEventListener("click", () => {
    applyState(!target.hidden);
  });
}
