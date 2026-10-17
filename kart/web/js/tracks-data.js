/*
 * Definição das pistas. Pontos de controle: [x, z, altura].
 * features: rampas ('jump'), rampas de planador ('glider') e placas de turbo ('boost'),
 * posicionadas no ponto da pista mais próximo de `at` ([x, z]); `lat` vai de -1 a 1 na largura.
 */
var TRACK_DEFS = [
  {
    id: 'coqueiral', name: 'Circuito Coqueiral', theme: 'beach', width: 16,
    points: [[0, 0, 0], [90, 0, 0], [150, 15, 2], [180, 65, 5], [160, 120, 6], [105, 135, 3], [75, 175, 1],
      [20, 200, 0], [-45, 180, 2], [-70, 125, 6], [-35, 85, 5], [-75, 45, 2], [-60, 5, 0]],
    features: [{ type: 'boost', at: [60, 0], lat: -0.45 }, { type: 'jump', at: [50, 195] }, { type: 'boost', at: [-60, 150], lat: 0.4 }]
  },
  {
    id: 'neblina', name: 'Vale Neblina', theme: 'mountain', width: 15,
    points: [[0, 0, 0], [70, -10, 4], [125, 10, 10], [150, 65, 15], [115, 110, 12], [60, 100, 7], [25, 130, 5],
      [45, 185, 9], [0, 230, 14], [-65, 210, 10], [-100, 155, 6], [-70, 100, 4], [-105, 45, 2], [-60, 5, 0]],
    features: [{ type: 'jump', at: [140, 40] }, { type: 'glider', at: [-30, 225] }, { type: 'boost', at: [-85, 70], lat: 0 }]
  },
  {
    id: 'neon', name: 'Cidade Neon', theme: 'city', width: 16,
    points: [[0, 0, 0], [110, 0, 0], [135, 25, 0], [135, 95, 2], [110, 120, 4], [50, 120, 6], [25, 145, 7],
      [25, 205, 7], [0, 230, 6], [-70, 230, 4], [-95, 205, 2], [-95, 70, 0], [-70, 45, 0], [-30, 45, 0], [-20, 15, 0]],
    features: [{ type: 'boost', at: [70, 0], lat: 0.45 }, { type: 'boost', at: [70, 0], lat: -0.45 }, { type: 'jump', at: [25, 175] }, { type: 'boost', at: [-95, 140], lat: 0 }]
  },
  {
    id: 'dunas', name: 'Dunas do Sol', theme: 'desert', width: 16,
    points: [[0, 0, 0], [80, 0, 3], [150, -10, 0], [200, 30, 4], [190, 95, 1], [130, 110, 5], [90, 150, 2],
      [110, 210, 6], [60, 250, 3], [-10, 240, 0], [-50, 190, 4], [-30, 130, 2], [-80, 90, 5], [-90, 30, 1], [-50, 0, 0]],
    features: [{ type: 'jump', at: [80, 0] }, { type: 'boost', at: [196, 60], lat: 0 }, { type: 'jump', at: [110, 210] }, { type: 'boost', at: [-40, 160], lat: -0.4 }, { type: 'jump', at: [-80, 90] }]
  },
  {
    id: 'nevado', name: 'Pico Nevado', theme: 'snow', width: 15,
    points: [[0, 0, 0], [60, 0, 6], [110, 20, 13], [140, 70, 20], [120, 120, 26], [70, 140, 28], [20, 150, 24],
      [-30, 170, 14], [-80, 160, 6], [-110, 110, 3], [-90, 60, 2], [-110, 10, 1], [-60, -20, 0]],
    features: [{ type: 'boost', at: [85, 10], lat: 0 }, { type: 'glider', at: [55, 143] }, { type: 'boost', at: [-100, 85], lat: 0.4 }]
  }
];
if (typeof module !== 'undefined') module.exports = TRACK_DEFS;
