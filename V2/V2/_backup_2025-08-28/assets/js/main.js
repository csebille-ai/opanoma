document.addEventListener("DOMContentLoaded", function() {
  // Scroll fluide pour les ancres internes
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener("click", function(e) {
      const targetId = this.getAttribute("href").substring(1);
      const target = document.getElementById(targetId);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: "smooth" });
      }
    });
  });

  // Met en pause la vidéo de fond quand l’onglet est inactif
  const bgVideo = document.getElementById("bgv");
  document.addEventListener("visibilitychange", function() {
    if (document.hidden) {
      bgVideo.pause();
    } else {
      bgVideo.play().catch(() => {});
    }
  });
});


