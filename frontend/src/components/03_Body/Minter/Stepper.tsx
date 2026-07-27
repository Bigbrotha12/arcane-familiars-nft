import { useState, Fragment } from 'react';
import Material from '../../../assets/Material';
import MintingSteps from './MintingSteps';
//import style from "../../../styles/Body.module.css";

const steps = ['Select NFT to Mint', 'Select Recipient Address', 'Sign Transaction'];

export default function HStepper() {
  const [activeStep, setActiveStep] = useState(0);

  const handleNext = () => {
    setActiveStep((prevActiveStep) => prevActiveStep + 1);
  };

  const handleBack = () => {
    setActiveStep((prevActiveStep) => prevActiveStep - 1);
  };

  const handleReset = () => {
    setActiveStep(0);
  };

  return (
    <Material.Box sx={{ width: '100%' }}>
        <div /*className={style.minterStepperHead}*/>
      <Material.Stepper activeStep={activeStep}>
        {steps.map((label) => {
          return (
            <Material.Step key={label}>
              <Material.StepLabel>{label}</Material.StepLabel>
            </Material.Step>
          );
        })}
      </Material.Stepper>
      </div>
      {activeStep === steps.length ? (
        <Fragment>
          <Material.Typography sx={{ mt: 2, mb: 1 }}>
            All steps completed - Minting in Progress
          </Material.Typography>
          <Material.Box sx={{ display: 'flex', flexDirection: 'row', pt: 2 }}>
            <Material.Box sx={{ flex: '1 1 auto' }} />
            <Material.Button onClick={handleReset}>Start Over</Material.Button>
          </Material.Box>
        </Fragment>
      ) : (
        <Fragment>
          <Material.Typography sx={{ mt: 2, mb: 1 }}>Step {activeStep + 1}</Material.Typography>
          <MintingSteps currentStep={activeStep} />
          
          <Material.Box sx={{ display: 'flex', flexDirection: 'row', pt: 2 }}>
            <Material.Button
              color="inherit"
              disabled={activeStep === 0}
              onClick={handleBack}
              sx={{ mr: 1 }}
            >
              Back
            </Material.Button>
            <Material.Box sx={{ flex: '1 1 auto' }} />
            <Material.Button onClick={handleNext}>
              {activeStep === steps.length - 1 ? 'Finish' : 'Next'}
            </Material.Button>      
          </Material.Box>

        </Fragment>
      )}
    </Material.Box>
  );
}
