const AppConfig = {
    "Mode": "Development",
    "API": {
      "Backend": {
        "URL": import.meta.env.VITE_BACKEND_URL || "http://localhost:8787"
      }
    },
    "SiteContent": {
      "sidebar": [
        {
          "title": "Familiars",
          "content": [
            {
              "label": "Play Game",
              "link": "/app/game"
            },
            {
              "label": "Collection",
              "link": "/app/collection"
            },
            {
              "label": "Marketplace",
              "link": "/app/marketplace"
            },
            {
              "label": "Mint",
              "link": "/app/minter"
            }
          ]
        }
      ]
    }
  }

export default AppConfig;
