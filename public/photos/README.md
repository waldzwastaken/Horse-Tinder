# Horse photos

Drop one photo per seed horse here, named by horse id, and it replaces that horse's drawing everywhere in the app:

```
h1.jpg   Biscuit       chestnut Quarter Horse mare
h2.jpg   Thunderhoof   black Friesian stallion
h3.jpg   Daisy         cream Welsh Pony mare
h4.jpg   Copper        chestnut Thoroughbred gelding
h5.jpg   Luna          grey Andalusian mare
h6.jpg   Big Red       sorrel Belgian Draft gelding
h7.jpg   Pepper        spotted Appaloosa mare
h8.jpg   Sir Reginald  grey Arabian stallion
h9.jpg   Maple         golden Haflinger mare
h10.jpg  Bandit        bay Mustang gelding
h11.jpg  Clementine    Paint Horse mare
h12.jpg  Zephyr        golden Akhal-Teke stallion
h13.jpg  Muffin        dark bay Shetland Pony gelding
h14.jpg  Willow        dark grey Irish Sport Horse mare
h15.jpg  Domino        bay Clydesdale gelding
h16.jpg  Starlight     dark bay Morgan mare
```

`.jpg`, `.jpeg`, `.png` and `.webp` all work. Portrait or square head shots look best on the cards. The hosted build downsizes each photo to 720px on its long side, so anything larger is fine.

Optional `credits.json` credits the photographer in the horse's profile:

```json
{ "h2": { "author": "A. Photographer", "license": "CC BY 4.0", "source": "https://example.com/photo" } }
```

Commit the photos with the app so every checkout has them.
