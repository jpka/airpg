# Design Explorer — MAP-Elites archive

Behaviour space: **any-success rate** (rows) × **memories lost per entity** (columns). Each cell keeps the highest-fitness rule variant that produces sessions of that kind. Scripted agents, 3 seeds per evaluation.

Baseline (default rules): fitness 4.031, descriptors {"falloutRate":0.522,"successRate":0.608,"cooperation":0.18,"memoryLoss":0,"coneGrowth":2.333,"peakPosition":0.71}

| any-success rate \ memories lost per entity | <0.25 | 0.25–0.75 | 0.75–1.25 | 1.25–2 | ≥2 |
|---|---|---|---|---|---|
| <0.3 | 3.53 | · | · | · | · |
| 0.3–0.45 | 3.80 | 3.66 | · | · | · |
| 0.45–0.55 | 4.17 | 4.05 | · | · | · |
| 0.55–0.65 | 4.31 | 4.27 | · | · | · |
| 0.65–0.75 | 4.20 | 4.07 | · | · | · |
| ≥0.75 | 4.21 | 4.03 | · | · | · |

Cells filled: 11/30

## Top elites

- **4.3145** cell 3,0 — rules `{"effectDie":{"standard":4},"memoryInvokeBonus":2,"roundsPerScene":{"landmark":2},"difficultyByTier":{"3":"risky"},"majorsToDissolve":2,"delveScale":0.6,"clockSizes":{"ingression":6,"attractor":8},"stressDie":{"risky":4}}` policy `{"harshness":0.5,"cooperation":0.4}`
  - descriptors {"falloutRate":0.426,"successRate":0.555,"cooperation":0.201,"memoryLoss":0.111,"coneGrowth":2,"peakPosition":0.796} · endings overrun/overrun/overrun · dead: haunt.rest, memory.lose, npc.moved · origin: mutation
- **4.2702** cell 3,1 — rules `{"stressDie":{"risky":4},"effectDie":{"standard":4},"majorsToDissolve":2,"delveScale":1,"clockSizes":{"ingression":10},"fallout":{"minorMax":8}}` policy `{"harshness":0.2,"cooperation":0.7}`
  - descriptors {"falloutRate":0.367,"successRate":0.62,"cooperation":0.315,"memoryLoss":0.333,"coneGrowth":2.333,"peakPosition":0.762} · endings unread/closed/closed · dead: haunt.rest, theorize, memory.lose, npc.moved · origin: mutation
- **4.2069** cell 5,0 — rules `{"memoryInvokeBonus":0,"difficultyByTier":{"3":"standard"},"clockSizes":{"attractor":4,"ingression":6},"stressDie":{"risky":4,"desperate":10},"roundsPerScene":{"landmark":2,"delve":1},"delveScale":1.2,"majorsToDissolve":4}` policy `{"harshness":0.8,"cooperation":0.1}`
  - descriptors {"falloutRate":0.33,"successRate":0.776,"cooperation":0.035,"memoryLoss":0.222,"coneGrowth":1.667,"peakPosition":0.81} · endings overrun/overrun/chosen · dead: haunt.rest, memory.lose, stress.share · origin: mutation
- **4.1971** cell 4,0 — rules `{"effectDie":{"standard":4},"memoryInvokeBonus":2,"roundsPerScene":{"landmark":2},"difficultyByTier":{"3":"risky"},"majorsToDissolve":4,"delveScale":1.2,"clockSizes":{"ingression":10},"cohesionForSharedCone":2}` policy `{"harshness":0.5,"cooperation":0.7}`
  - descriptors {"falloutRate":0.402,"successRate":0.688,"cooperation":0.287,"memoryLoss":0,"coneGrowth":3,"peakPosition":0.775} · endings chosen/overrun/chosen · dead: haunt.rest, memory.lose · origin: mutation
- **4.1721** cell 2,0 — rules `{"memoryInvokeBonus":0,"difficultyByTier":{"3":"risky"},"clockSizes":{"attractor":6},"stressDie":{"risky":4},"roundsPerScene":{"landmark":2,"delve":3},"delveScale":1.2,"majorsToDissolve":3,"theorize":{"complexity":2},"cohesionForSharedCone":2,"effectDie":{"standard":4}}` policy `{"harshness":0.2,"cooperation":0.1}`
  - descriptors {"falloutRate":0.427,"successRate":0.537,"cooperation":0.058,"memoryLoss":0.222,"coneGrowth":1,"peakPosition":0.742} · endings closed/overrun/overrun · dead: haunt.rest, theorize, memory.lose · origin: mutation
- **4.0718** cell 4,1 — rules `{"effectDie":{"standard":4},"memoryInvokeBonus":2,"roundsPerScene":{"landmark":2},"difficultyByTier":{"3":"risky"},"majorsToDissolve":4,"delveScale":1.2,"clockSizes":{"ingression":10},"cohesionForSharedCone":2,"stressDie":{"risky":8},"theorize":{"complexity":6}}` policy `{"harshness":0.5,"cooperation":0.7}`
  - descriptors {"falloutRate":0.561,"successRate":0.733,"cooperation":0.241,"memoryLoss":0.333,"coneGrowth":3.333,"peakPosition":0.711} · endings unread/chosen/chosen · dead: haunt.rest, memory.lose · origin: mutation
- **4.0504** cell 2,1 — rules `{"memoryInvokeBonus":1,"difficultyByTier":{"3":"risky"},"clockSizes":{"attractor":4,"ingression":12},"stressDie":{"risky":4},"roundsPerScene":{"landmark":2,"delve":1},"delveScale":1.2,"majorsToDissolve":4,"theorize":{"complexity":2},"cohesionForSharedCone":2,"effectDie":{"standard":6}}` policy `{"harshness":0.2,"cooperation":0.1}`
  - descriptors {"falloutRate":0.448,"successRate":0.514,"cooperation":0.045,"memoryLoss":0.333,"coneGrowth":0.667,"peakPosition":0.769} · endings overrun/chosen/unread · dead: haunt.rest, memory.lose, theorize · origin: mutation
- **4.0323** cell 5,1 — rules `{"effectDie":{"standard":4},"memoryInvokeBonus":2,"roundsPerScene":{"landmark":2,"delve":2},"difficultyByTier":{"3":"risky"},"majorsToDissolve":4,"delveScale":1.2,"clockSizes":{"ingression":10,"attractor":4},"cohesionForSharedCone":2,"stressDie":{"risky":8}}` policy `{"harshness":0.5,"cooperation":0.7}`
  - descriptors {"falloutRate":0.471,"successRate":0.757,"cooperation":0.24,"memoryLoss":0.333,"coneGrowth":3.667,"peakPosition":0.799} · endings overrun/chosen/chosen · dead: haunt.rest, memory.lose · origin: mutation

_Fitness is the reviewer composite (beats, tension variance, late climax, agency, mechanic coverage, difficulty & fallout bands, clip strength, minus spotlight imbalance and repetition). Re-validate top elites with LLM agents before adopting a rule change._