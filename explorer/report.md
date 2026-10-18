# Design Explorer — MAP-Elites archive

Behaviour space: **any-success rate** (rows) × **memories lost per entity** (columns). Each cell keeps the highest-fitness rule variant that produces sessions of that kind. Scripted agents, 3 seeds per evaluation.

Baseline (default rules): fitness 3.9754, descriptors {"falloutRate":0.499,"successRate":0.527,"cooperation":0.24,"memoryLoss":0.444,"coneGrowth":2.667,"peakPosition":0.767}

| any-success rate \ memories lost per entity | <0.25 | 0.25–0.75 | 0.75–1.25 | 1.25–2 | ≥2 |
|---|---|---|---|---|---|
| <0.3 | · | 3.44 | · | · | · |
| 0.3–0.45 | 3.67 | 3.94 | 3.86 | · | · |
| 0.45–0.55 | 4.18 | 4.37 | 4.30 | · | · |
| 0.55–0.65 | 4.21 | 4.28 | 4.37 | · | · |
| 0.65–0.75 | · | 4.41 | 4.47 | · | · |
| ≥0.75 | 3.66 | 4.29 | 4.34 | · | · |

Cells filled: 15/30

## Top elites

- **4.4714** cell 4,2 — rules `{"stressDie":{"risky":4},"effectDie":{"standard":4},"theorize":{"complexity":4},"memoryInvokeBonus":1,"roundsPerScene":{"landmark":2,"delve":1},"cohesionForSharedCone":4,"difficultyByTier":{"3":"standard"},"majorsToDissolve":3,"delveScale":0.8,"clockSizes":{"ingression":10,"attractor":8}}` policy `{"harshness":0.2,"cooperation":0.7}`
  - descriptors {"falloutRate":0.279,"successRate":0.721,"cooperation":0.22,"memoryLoss":0.778,"coneGrowth":3.667,"peakPosition":0.895} · endings chosen/chosen/overrun · dead: none · origin: mutation
- **4.4105** cell 4,1 — rules `{"stressDie":{"risky":4},"effectDie":{"standard":4},"theorize":{"complexity":3},"memoryInvokeBonus":1,"roundsPerScene":{"landmark":2,"delve":1},"cohesionForSharedCone":4,"difficultyByTier":{"3":"standard"},"majorsToDissolve":3,"delveScale":0.8,"clockSizes":{"ingression":8,"attractor":8}}` policy `{"harshness":0.2,"cooperation":0.7}`
  - descriptors {"falloutRate":0.28,"successRate":0.721,"cooperation":0.253,"memoryLoss":0.667,"coneGrowth":3.333,"peakPosition":0.8} · endings overrun/chosen/chosen · dead: none · origin: mutation
- **4.3723** cell 3,2 — rules `{"effectDie":{"standard":4},"memoryInvokeBonus":2,"roundsPerScene":{"landmark":2},"difficultyByTier":{"3":"risky"},"majorsToDissolve":2,"delveScale":0.8,"clockSizes":{"ingression":6,"attractor":6}}` policy `{"harshness":0.5,"cooperation":0.7}`
  - descriptors {"falloutRate":0.357,"successRate":0.561,"cooperation":0.347,"memoryLoss":1,"coneGrowth":4.667,"peakPosition":0.738} · endings overrun/overrun/chosen · dead: none · origin: mutation
- **4.3674** cell 2,1 — rules `{"fallout":{"minorMax":8},"stressDie":{"risky":4,"desperate":8},"memoryInvokeBonus":1,"roundsPerScene":{"delve":1,"landmark":2},"cohesionForSharedCone":5,"delveScale":0.6,"effectDie":{"standard":6},"clockSizes":{"attractor":4}}` policy `{"harshness":0.2,"cooperation":0.7}`
  - descriptors {"falloutRate":0.378,"successRate":0.532,"cooperation":0.351,"memoryLoss":0.666,"coneGrowth":4.667,"peakPosition":0.679} · endings overrun/chosen/chosen · dead: none · origin: mutation
- **4.3353** cell 5,2 — rules `{"stressDie":{"risky":4},"effectDie":{"standard":4},"theorize":{"complexity":3},"memoryInvokeBonus":1,"roundsPerScene":{"landmark":2,"delve":1},"cohesionForSharedCone":4,"difficultyByTier":{"3":"standard"},"majorsToDissolve":3,"delveScale":0.8,"clockSizes":{"ingression":12,"attractor":6}}` policy `{"harshness":0.2,"cooperation":0.4}`
  - descriptors {"falloutRate":0.292,"successRate":0.765,"cooperation":0.149,"memoryLoss":0.889,"coneGrowth":2.667,"peakPosition":0.772} · endings chosen/chosen/closed · dead: theorize · origin: mutation
- **4.303** cell 2,2 — rules `{"fallout":{"minorMax":8},"stressDie":{"risky":4,"desperate":10},"memoryInvokeBonus":1,"roundsPerScene":{"delve":1,"landmark":2},"cohesionForSharedCone":5,"delveScale":0.6}` policy `{"harshness":0.2,"cooperation":0.7}`
  - descriptors {"falloutRate":0.444,"successRate":0.548,"cooperation":0.314,"memoryLoss":0.778,"coneGrowth":5,"peakPosition":0.792} · endings overrun/chosen/overrun · dead: choice.persuade · origin: random
- **4.2862** cell 5,1 — rules `{"stressDie":{"risky":4},"effectDie":{"standard":4},"theorize":{"complexity":3},"memoryInvokeBonus":1,"roundsPerScene":{"landmark":2,"delve":1},"cohesionForSharedCone":4,"difficultyByTier":{"3":"standard"},"majorsToDissolve":3,"delveScale":0.8,"clockSizes":{"ingression":10,"attractor":8}}` policy `{"harshness":0.2,"cooperation":0.7}`
  - descriptors {"falloutRate":0.277,"successRate":0.752,"cooperation":0.242,"memoryLoss":0.667,"coneGrowth":3.333,"peakPosition":0.937} · endings chosen/chosen/chosen · dead: none · origin: mutation
- **4.2804** cell 3,1 — rules `{"effectDie":{"standard":4},"memoryInvokeBonus":2,"roundsPerScene":{"landmark":2},"difficultyByTier":{"3":"risky"},"majorsToDissolve":2,"delveScale":1.2,"clockSizes":{"ingression":6}}` policy `{"harshness":0.5,"cooperation":0.7}`
  - descriptors {"falloutRate":0.436,"successRate":0.59,"cooperation":0.378,"memoryLoss":0.667,"coneGrowth":3.667,"peakPosition":0.793} · endings overrun/overrun/overrun · dead: none · origin: random

_Fitness is the reviewer composite (beats, tension variance, late climax, agency, mechanic coverage, difficulty & fallout bands, clip strength, minus spotlight imbalance and repetition). Re-validate top elites with LLM agents before adopting a rule change._