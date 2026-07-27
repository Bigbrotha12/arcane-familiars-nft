import { Fragment } from 'react';
import Material from "@mui/material"

export default function MintingSteps(props: {currentStep: number}) {

  return (
    <Fragment>
      {props.currentStep == 0 &&
      <Material.FormControl fullWidth>
        <Material.InputLabel id="NFT-available">Available NFT</Material.InputLabel>
        <Material.Select value="" labelId='NFT-available' label="Available NFT">
          <Material.MenuItem value={1}>Monster 1</Material.MenuItem>
          <Material.MenuItem value={34}>Monster 2</Material.MenuItem>
        </Material.Select>
      </Material.FormControl>}

      {props.currentStep == 1 &&
      <Material.FormControl fullWidth>
        <Material.InputLabel id="USer-Address">Input Your Address</Material.InputLabel>
        <Material.Input value="" />
      </Material.FormControl>}

      {props.currentStep == 2 &&
      <Material.FormControl fullWidth>
        <Material.Typography id="Approval">Approve the Transaction</Material.Typography>
        <Material.Button variant="outlined">Approve</Material.Button>
      </Material.FormControl>}
    </Fragment>
  )
}
