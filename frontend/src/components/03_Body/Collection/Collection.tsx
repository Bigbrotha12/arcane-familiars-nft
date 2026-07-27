import { useContext } from 'react';
import { useSelector } from "react-redux";
import { Familiar } from '../../../types/Familiar';
import Material from "../../../assets/Material";
import { IMX, RootState } from "../../../state/Context";

import FamiliarCard from './FamiliarCard';
import SearchBar from "./SearchBar";

export default function Collection() {

  const assets: Array<Familiar> = useSelector<RootState, Array<Familiar>>(state => state.session.assets);
  const [client, , loading, error] = useContext(IMX);
  console.log(assets);
  // if user assets have been fetched, display array of cards.
  return (
    <div className="h-full w-full">
      <SearchBar />
      <Material.Grid sx={{margin: "auto", padding: "4px", height: "100%", width: "100%"}} container spacing={1}>
        {createCards(assets)}
      </Material.Grid>
    </div>
  )
}

function createCards(familiars: Array<Familiar>): Array<JSX.Element> {
  if (familiars.length === 0) { return [<p key='0'>No Familiars to show.</p>]; }

  return familiars.map( (familiar, index) => {
    return <FamiliarCard key={index} familiar={familiar} />
  });
}

// const sampleAssets: Array<Familiar> = [
//   {
//     _id: 0,
//     familiarId: 0,
//     name: "White Dog",
//     description: "A mage's best friend",
//     image_url: "http://my-unity-game.s3-website-us-east-1.amazonaws.com/images/0001.png",
//     image: "White Dog",
//     affinity: Affinity.Light,
//     HP: 220,
//     MP: 120,
//     attack: 80,
//     defense: 66,
//     arcane: 120,
//     speed: 170,
//     ability_1: "Brave",
//     ability_2: "Sturdy",
//     ability_3: "none",
//     ability_4: "none",
//     rarity: Rarity.common,
//     generation: 1
//   },
//   {
//     _id: 0,
//     familiarId: 0,
//     name: "White Dog",
//     description: "A mage's best friend",
//     image_url: "http://my-unity-game.s3-website-us-east-1.amazonaws.com/images/0001.png",
//     image: "White Dog",
//     affinity: Affinity.Light,
//     HP: 220,
//     MP: 120,
//     attack: 80,
//     defense: 66,
//     arcane: 120,
//     speed: 170,
//     ability_1: "Brave",
//     ability_2: "Sturdy",
//     ability_3: "none",
//     ability_4: "none",
//     rarity: Rarity.common,
//     generation: 1
//   },
//   {
//     _id: 0,
//     familiarId: 0,
//     name: "White Dog",
//     description: "A mage's best friend",
//     image_url: "http://my-unity-game.s3-website-us-east-1.amazonaws.com/images/0001.png",
//     image: "White Dog",
//     affinity: Affinity.Light,
//     HP: 220,
//     MP: 120,
//     attack: 80,
//     defense: 66,
//     arcane: 120,
//     speed: 170,
//     ability_1: "Brave",
//     ability_2: "Sturdy",
//     ability_3: "none",
//     ability_4: "none",
//     rarity: Rarity.common,
//     generation: 1
//   },
//   {
//     _id: 0,
//     familiarId: 0,
//     name: "White Dog",
//     description: "A mage's best friend",
//     image_url: "http://my-unity-game.s3-website-us-east-1.amazonaws.com/images/0001.png",
//     image: "White Dog",
//     affinity: Affinity.Light,
//     HP: 220,
//     MP: 120,
//     attack: 80,
//     defense: 66,
//     arcane: 120,
//     speed: 170,
//     ability_1: "Brave",
//     ability_2: "Sturdy",
//     ability_3: "none",
//     ability_4: "none",
//     rarity: Rarity.common,
//     generation: 1
//   },
//   {
//     _id: 0,
//     familiarId: 0,
//     name: "White Dog",
//     description: "A mage's best friend",
//     image_url: "http://my-unity-game.s3-website-us-east-1.amazonaws.com/images/0001.png",
//     image: "White Dog",
//     affinity: Affinity.Light,
//     HP: 220,
//     MP: 120,
//     attack: 80,
//     defense: 66,
//     arcane: 120,
//     speed: 170,
//     ability_1: "Brave",
//     ability_2: "Sturdy",
//     ability_3: "none",
//     ability_4: "none",
//     rarity: Rarity.common,
//     generation: 1
//   },
//   {
//     _id: 0,
//     familiarId: 0,
//     name: "White Dog",
//     description: "A mage's best friend",
//     image_url: "http://my-unity-game.s3-website-us-east-1.amazonaws.com/images/0001.png",
//     image: "White Dog",
//     affinity: Affinity.Light,
//     HP: 220,
//     MP: 120,
//     attack: 80,
//     defense: 66,
//     arcane: 120,
//     speed: 170,
//     ability_1: "Brave",
//     ability_2: "Sturdy",
//     ability_3: "none",
//     ability_4: "none",
//     rarity: Rarity.common,
//     generation: 1
//   }
// ]


