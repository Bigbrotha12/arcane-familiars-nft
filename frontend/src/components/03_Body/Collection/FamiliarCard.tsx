import { Familiar } from '../../../types/Familiar';
import Material from "../../../assets/Material";

export default function FamiliarCard(props: any) {
  const familiar: Familiar = props.familiar;

  return (
    <Material.Grid xs={6} md={4} lg={3}>
      <Material.Card sx={{ 
          maxWidth: 345, 
          marginTop: "10px", 
          marginBottom: "10px"}}>

          <Material.CardHeader 
          title={familiar.name}
          subheader={familiar.affinity + " Familiar - " + familiar.rarity} />

          <Material.CardMedia 
          component="img"
          height="150"
          image={familiar.image_url}
          alt={familiar.name}
          />
    
          <Material.CardContent>
            <Material.Divider variant="middle">Generation {familiar.generation}</Material.Divider>
            <Material.Typography variant="body2" color="text.secondary">
              {familiar.description}
            </Material.Typography>
            <StatsGrid familiar={familiar} />
          </Material.CardContent>
          
          <Material.CardActions sx={{display: "flex", justifyContent:"space-between"}}>
            <Material.Typography sx={{marginLeft: "8px"}}>View Market</Material.Typography>
            <Material.Typography sx={{marginRight: "8px"}}>Transfer</Material.Typography>
          </Material.CardActions>
          
        </Material.Card>
      </Material.Grid>
  )
}

function StatsGrid(props: any): JSX.Element {
  const familiar = props.familiar;
  return (
    <Material.Box>
      <div className="flex flex-row w-full">
        <Material.Paper sx={{width: "50%", borderRadius: "0px"}} variant="outlined">
          <Material.Typography sx={{marginLeft: "4px"}}>HP: {familiar.HP}</Material.Typography>
        </Material.Paper>
        <Material.Paper sx={{width: "50%", borderRadius: "0px"}} variant="outlined">
          <Material.Typography sx={{marginLeft: "4px"}}>HP: {familiar.MP}</Material.Typography>
        </Material.Paper>
      </div>

      <div className="flex flex-row w-full">
        <Material.Paper sx={{width: "50%", borderRadius: "0px"}} variant="outlined">
          <Material.Typography sx={{marginLeft: "4px"}}>Attack: {familiar.attack}</Material.Typography>
        </Material.Paper>
        <Material.Paper sx={{width: "50%", borderRadius: "0px"}} variant="outlined">
          <Material.Typography sx={{marginLeft: "4px"}}>Defense: {familiar.defense}</Material.Typography>
        </Material.Paper>
      </div>

      <div className="flex flex-row w-full">
        <Material.Paper sx={{width: "50%", borderRadius: "0px"}} variant="outlined">
          <Material.Typography sx={{marginLeft: "4px"}}>Arcane: {familiar.arcane}</Material.Typography>
        </Material.Paper>
        <Material.Paper sx={{width: "50%", borderRadius: "0px"}} variant="outlined">
          <Material.Typography sx={{marginLeft: "4px"}}>Speed: {familiar.speed}</Material.Typography>
        </Material.Paper>
      </div>
    </Material.Box>
  );
}
