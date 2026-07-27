import { Select, MenuItem, FormControl, InputLabel, Input, Button, Typography } from '@mui/material';
import { useState, FormEvent } from 'react';
import { useSelector } from 'react-redux';
import { IMXBalance } from '../../../types/IMX';
import { Familiar } from '../../../types/Familiar';
import { RootState } from '../../../state/Context';

export default function BridgeWithdraw() {
    
    const assets: Array<Familiar> = useSelector<RootState, Array<Familiar>>(state => state.session.assets);
    const balance: IMXBalance = useSelector<RootState, IMXBalance>(state => state.session.balance);
    const [amount, setAmount] = useState<string>("0");
    const handleSubmit = (event: FormEvent) => {
        event.preventDefault();
        const data = new FormData(event.target as HTMLFormElement);
        console.log(data);
    }

    return(
        <form onSubmit={handleSubmit}>
            <Typography sx={{maxWidth:"500px", marginBottom:"20px"}}>
                You can withdraw ETH and Familiar NFTs from Layer 2 IMX to Ethereum. 
                Note that this transaction will incur gas fees. Deposited assets are usually
                available 24 hours after submission.
            </Typography>
            <FormControl fullWidth>
            <InputLabel id="asset-type">Asset Type</InputLabel>
                <Select value="" labelId="asset-type" label="Asset Type">
                    {assets.map(asset => (
                        <MenuItem key={asset._id} value={asset.name}>{asset.name}</MenuItem>
                    ))}
                </Select>
            </FormControl>

            <FormControl sx={{marginTop:'15px'}} fullWidth>
                <InputLabel id="asset">Amount</InputLabel>
                <Input 
                name="amount" 
                id="amount" 
                type="number"
                inputProps={{min:'0'}}
                required
                error={parseInt(balance.available) < parseInt(amount)}  
                onChange={event => {
                    if(/[0-9]{*}/.test(event.target.value)) setAmount(event.target.value)
                }}
                />
            </FormControl>

            <FormControl sx={{marginTop: '10px'}} fullWidth>
                <Button variant="outlined">Withdraw</Button>
            </FormControl>

        </form>
    );
}