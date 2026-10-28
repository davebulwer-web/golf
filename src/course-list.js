// The career's courses, tier by tier, easiest first. Written by
// tools/curate-courses.mjs: `rating` is how many shots over par a club-standard
// golfer averages per nine holes there. `par` is for all eighteen holes (it
// shapes the course); `roundPar` and `yards` are for the holes a round there
// plays, from the white tees.

export const COURSE_LIST = {
  club: [
    {"id":"club-1","name":"LITTLE WIGGLEY GOLF CLUB","style":"parkland","seed":316924,"par":70,"length":"forward","tour":"club","holes":9,"roundPar":35,"yards":2312,"rating":-3.5},
    {"id":"club-2","name":"HEATHERCOTE GOLF CLUB","style":"heathland","seed":289367,"par":70,"length":"forward","tour":"club","holes":9,"roundPar":35,"yards":2284,"rating":-1.2},
    {"id":"club-3","name":"ASHWORTHY GOLF CLUB","style":"parkland","seed":112214,"par":68,"length":"forward","tour":"club","holes":9,"roundPar":34,"yards":2502,"rating":-1},
    {"id":"club-4","name":"OAKENDEN GOLF CLUB","style":"parkland","seed":105943,"par":69,"length":"forward","tour":"club","holes":9,"roundPar":35,"yards":2430,"rating":-1},
    {"id":"club-5","name":"SQUIRREL HOLLOW GOLF CLUB","style":"woodland","seed":77334,"par":70,"length":"forward","tour":"club","holes":9,"roundPar":35,"yards":2460,"rating":-0.7},
    {"id":"club-6","name":"ELMSTEAD GOLF CLUB","style":"woodland","seed":430894,"par":70,"length":"forward","tour":"club","holes":9,"roundPar":35,"yards":2433,"rating":-0.7},
  ],
  county: [
    {"id":"county-1","name":"GULLSTONE GOLF CLUB","style":"links","seed":349366,"par":70,"length":"short","tour":"county","holes":18,"roundPar":70,"yards":5601,"rating":0.6},
    {"id":"county-2","name":"DRY GULCH GOLF & COUNTRY CLUB","style":"desert","seed":736843,"par":70,"length":"short","tour":"county","holes":18,"roundPar":70,"yards":5686,"rating":0.6},
    {"id":"county-3","name":"CACTUS FLATS GOLF & COUNTRY CLUB","style":"desert","seed":953185,"par":71,"length":"standard","tour":"county","holes":18,"roundPar":71,"yards":6262,"rating":1},
    {"id":"county-4","name":"MUDFORD GOLF & COUNTRY CLUB","style":"parkland","seed":463384,"par":72,"length":"standard","tour":"county","holes":18,"roundPar":72,"yards":6214,"rating":1.4},
    {"id":"county-5","name":"KITTIWAKE GOLF CLUB","style":"links","seed":768656,"par":71,"length":"standard","tour":"county","holes":18,"roundPar":71,"yards":6141,"rating":1.6},
    {"id":"county-6","name":"WHINBURY GOLF CLUB","style":"heathland","seed":601633,"par":70,"length":"standard","tour":"county","holes":18,"roundPar":70,"yards":5989,"rating":1.6},
  ],
  challenge: [
    {"id":"challenge-1","name":"OWLCOMBE GOLF CLUB","style":"woodland","seed":10122,"par":72,"length":"standard","tour":"challenge","holes":18,"roundPar":72,"yards":6202,"rating":1.3},
    {"id":"challenge-2","name":"CHUMLEY PARK GOLF RESORT","style":"parkland","seed":367316,"par":72,"length":"standard","tour":"challenge","holes":18,"roundPar":72,"yards":6189,"rating":1.3},
    {"id":"challenge-3","name":"GORSEMOOR GOLF CLUB","style":"heathland","seed":255957,"par":72,"length":"standard","tour":"challenge","holes":18,"roundPar":72,"yards":6239,"rating":1.3},
    {"id":"challenge-4","name":"DUNEHAVEN GOLF RESORT","style":"links","seed":85946,"par":72,"length":"standard","tour":"challenge","holes":18,"roundPar":72,"yards":6195,"rating":1.3},
    {"id":"challenge-5","name":"WINDY POINT GOLF CLUB","style":"links","seed":661940,"par":71,"length":"standard","tour":"challenge","holes":18,"roundPar":71,"yards":6202,"rating":2},
    {"id":"challenge-6","name":"PALM LAGOON GOLF CLUB","style":"tropical","seed":953051,"par":71,"length":"standard","tour":"challenge","holes":18,"roundPar":71,"yards":6136,"rating":2},
  ],
  tour: [
    {"id":"tour-1","name":"BIG TOP GOLF RESORT","style":"stadium","seed":655086,"par":72,"length":"standard","tour":"tour","holes":18,"roundPar":72,"yards":6218,"rating":2.1},
    {"id":"tour-2","name":"EDELWEISS NATIONAL","style":"alpine","seed":202473,"par":72,"length":"standard","tour":"tour","holes":18,"roundPar":72,"yards":6759,"rating":2.1},
    {"id":"tour-3","name":"MARRAMSIDE NATIONAL","style":"links","seed":342917,"par":72,"length":"long","tour":"tour","holes":18,"roundPar":72,"yards":6459,"rating":2.3},
    {"id":"tour-4","name":"DUSTY SPRINGS GOLF RESORT","style":"desert","seed":524018,"par":72,"length":"long","tour":"tour","holes":18,"roundPar":72,"yards":6482,"rating":2.5},
    {"id":"tour-5","name":"MESA ROJA NATIONAL","style":"desert","seed":962795,"par":72,"length":"long","tour":"tour","holes":18,"roundPar":72,"yards":6473,"rating":3.1},
    {"id":"tour-6","name":"THUNDER BOWL GOLF RESORT","style":"stadium","seed":718516,"par":72,"length":"long","tour":"tour","holes":18,"roundPar":72,"yards":6647,"rating":3.5},
  ],
  majors: [
    {"id":"majors-1","name":"ROYAL BRACKENFOLD","style":"heathland","seed":876889,"par":72,"length":"long","tour":"majors","holes":18,"roundPar":72,"yards":6381,"rating":3},
    {"id":"majors-2","name":"GRAND ARENA NATIONAL","style":"stadium","seed":12836,"par":72,"length":"long","tour":"majors","holes":18,"roundPar":72,"yards":6494,"rating":4},
    {"id":"majors-3","name":"ROYAL COLOSSEUM CREEK","style":"stadium","seed":752259,"par":72,"length":"long","tour":"majors","holes":18,"roundPar":72,"yards":6705,"rating":4.5},
    {"id":"majors-4","name":"ROYAL IRONGATE","style":"stadium","seed":105511,"par":72,"length":"long","tour":"majors","holes":18,"roundPar":72,"yards":6566,"rating":5.5},
  ],
};
