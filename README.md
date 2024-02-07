# Serveur GTFS des horaires et lignes de bus en France

On utilise node-gtfs pour dézipper, parser et servir les bons JSON pour répondre aux besoins de [Voyage](https://github.com/laem/futureco/issues/162).

Pour l'instant, [seul le GTFS de la Bretagne est téléchargé](https://github.com/laem/gtfs/blob/master/server.js#L31). C'est vraiment basique.

Je vais mettre dans les issues les prochains développements à faire.

# Création de la configuration

D'abord lancer le téléchargement des fichiers GTFS et la création de la configuration node-GTFS.

```
deno run --allow-net --allow-read --allow-write buildConfig.ts
```

# Déploiement

J'ai d'abord testé Scalingo. Ça marche, mais à chaque déploiement il faut repeupler la DB, et ça commence à prendre beaucoup de temps. Les PaaS sont donc limitantes, et plus chères qu'un simple VPS.

Clairement, le VPS ne tiendra pas à terme, mais pour commencer c'est bien.

J'ai voulu déployer de dépôt en edge computing. Turso.tech permettrait de stocker la DB, et Deno de déployer le serveur. Mais Deno ne peut pas encore faire tourner node-gtfs, du à des incompatibilités de packages. Faudrait changer beaucoup node-GTFS pour le faire marcher.

Deuxième problème, node-GTFS utilise better-sqlite3, et c'est donc une API différente de ce qu'utilisent Turso ou encore Fly.io. Il faudrait l'adapter pour accepter d'autres ORM, en gros.

Dernier point : node-GTFS ne fait pas le café, juste une API de recherche dans les GTFS. Ainsi il doit être couplé à Motis. Ce dernier pourrait remplacer node-GTFS, mais on en est loin je crois à ce stade et la documentation est lacunaire.

Ainsi, héberger node-GTFS et Motis sur le même serveur VPS est intéressant. Surtout que la sécurisation de ce serveur, on s'en fout, il n'y a rien de confidentiel.

Resterait donc à fusionner laem/motis et laem/gtfs, pour mettre en commun le dépôt et surtout la gestion des GTFS à télécharger et mettre à jour avec un CRON.

Ensuite, trouver un moyen de déployer plusieurs serveurs pour scaler, ou retester l'expérience PaaS ou Edge, mais on verra ça quand on aura du succès.
