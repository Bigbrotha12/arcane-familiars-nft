import Phaser from "phaser";

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "BootScene" });
  }

  preload(): void {
  }

  create(): void {
    const { width, height } = this.scale;

    const title = this.add.text(width / 2, height / 3, "Arcane Familiars", {
      fontSize: "40px",
      fontFamily: "monospace",
      color: "#7C5CFC",
    });
    title.setOrigin(0.5);

    const loading = this.add.text(width / 2, height / 2, "Loading...", {
      fontSize: "18px",
      fontFamily: "monospace",
      color: "#a0a0b0",
    });
    loading.setOrigin(0.5);

    this.time.delayedCall(800, () => {
      this.scene.start("WorldMapScene");
    });
  }
}
