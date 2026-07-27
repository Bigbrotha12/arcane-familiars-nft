// Environment variables are exposed via Vite's import.meta.env.
// See frontend/.env.example for available variables.
const AppConfig = {
    "Mode": "Production", //"Development",
    "API": {
      "IMX": {
        "Sandbox": "https://api.sandbox.x.immutable.com",
        "Mainnet": "https://api.x.immutable.com",
        "CacheExpiration": 10
      },
      "Link": {
        "Sandbox": "https://link.sandbox.x.immutable.com",
        "Mainnet": "https://link.x.immutable.com"
      },
      "Ethereum": {
        "Sandbox": {
          "name": "Ethereum Goerli",
          "chainId": 5,
          "rpc": `https://goerli.infura.io/v3/${import.meta.env.VITE_INFURA_API_KEY}`,
          "wss": `ws://goerli.infura.io/v3/${import.meta.env.VITE_INFURA_API_KEY}`,
          "explorer": "https://goerli.etherscan.io"
        },
        "Mainnet": {
          "name": "Ethereum Mainnet",
          "chainId": 1,
          "rpc": `https://mainnet.infura.io/v3/${import.meta.env.VITE_INFURA_API_KEY}`,
          "wss": `ws://mainnet.infura.io/v3/${import.meta.env.VITE_INFURA_API_KEY}`,
          "explorer": "https://etherscan.io"
        }
      }
    },
    "Unity": {
      "loader": "https://d1mbjgj7eazbwc.cloudfront.net/Build.loader.js",
      "framework": "https://d1mbjgj7eazbwc.cloudfront.net/Build.framework.js",
      "code": "https://d1mbjgj7eazbwc.cloudfront.net/Build.wasm",
      "data": "https://d1mbjgj7eazbwc.cloudfront.net/Build.data"
    },
    "Blockchain": {
      "IMX": {
        "Sandbox": "0x5FDCCA53617f4d2b9134B29090C87D01058e27e9",
        "Mainnet": ""
      },
      "Collection": {
        "Sandbox": "0xb7eaa855fa6432d0597f297bace4613c33a075d1",
        "Mainnet": "0xacb3c6a43d15b907e8433077b6d38ae40936fe2c",
        "Images": ""
      }
    },
    "SiteContent": {
      "hyperlinks": {
        "IMX": "https://market.immutable.com"
      },
      "sidebar": [
        {
          "title": "Familiars",
          "content": [
            {
              "label": "Play Game",
              "icon": "Cards 2.png",
              "link": "/app/game"
            },
            {
              "label": "Collection",
              "icon": "Grimoire 3.png",
              "link": "/app/collection"
            },
            {
              "label": "Marketplace",
              "icon": "Runes 3.png",
              "link": "/app/marketplace"
            },
            {
              "label": "Mint",
              "icon": "Tower 2.png",
              "link": "/app/minter"
            }
          ]
        },
        {
          "title": "Blockchain",
          "content": [
            {
              "label": "Bridge",
              "icon": "Tower 3.png",
              "link": "/app/bridge"
            }
          ]
        }
      ],
      "assets": {
        "images": "http://my-unity-game.s3-website-us-east-1.amazonaws.com/assets/"
      }
    }
  }
  
export default AppConfig;
