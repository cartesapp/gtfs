# API des horaires et lignes de bus en France (standard GTFS)

On utilise node-gtfs pour parser et servir les bons JSON pour répondre aux besoins de [Cartes.app](https://github.com/laem/cartes/issues/162).

Ce dépôt est aussi celui où on va lister et récupérer les GTFS qui nous intéressent avec un script Deno. Il est donc la source des données pour [laem/motis](https://github.com/laem/motis), qui lui gère le routage.

## Couverture

Pour l'instant, on se concentre sur l'ouest de la France. La plus belle région du pays mérite ça :p

Vous êtes développeur ou bidouilleur et vous aimeriez que votre territoire y soit ? Allons-y !

C'est assez simple : il faut ajouter une ligne dans le fichier [input.yaml](https://github.com/laem/gtfs/blob/master/input.yaml).

## Création de la configuration

D'abord lancer le téléchargement des fichiers GTFS et la création de la configuration node-GTFS.

Nécessite d'installer Deno.

```
cd gtfs
yarn build-config
```

Ensuite c'est simple, mais pas encore automatisé :

```
PORT=3001 pm2 start "yarn start"
# URL/fetch pour que node-GTFS avale les GTFS
cd ../motis # après avoir installé laem/motis
./start.sh # ou systemctl start motis.service si installé via démon
```

## Déploiement

J'ai d'abord testé Scalingo. Ça marche, mais à chaque déploiement il faut repeupler la DB, et ça commence à prendre beaucoup de temps. Les PaaS sont donc limitantes, et plus chères qu'un simple VPS.

Clairement, le VPS ne tiendra pas à terme, mais pour commencer c'est bien.

J'ai voulu déployer de dépôt en edge computing. Turso.tech permettrait de stocker la DB, et Deno de déployer le serveur. Mais Deno ne peut pas encore faire tourner node-gtfs, du à des incompatibilités de packages. Faudrait changer beaucoup node-GTFS pour le faire marcher.

Deuxième problème, node-GTFS utilise better-sqlite3, et c'est donc une API différente de ce qu'utilisent Turso ou encore Fly.io. Il faudrait l'adapter pour accepter d'autres ORM, en gros.

Dernier point : node-GTFS ne fait pas le café, juste une API de recherche dans les GTFS. Ainsi il doit être couplé à Motis. Ce dernier pourrait remplacer node-GTFS, mais on en est loin je crois à ce stade et la documentation est lacunaire.

Ainsi, héberger node-GTFS et Motis sur le même serveur VPS est intéressant. Surtout que la sécurisation de ce serveur, on s'en fout, il n'y a rien de confidentiel.

Resterait donc à fusionner laem/motis et laem/gtfs, pour mettre en commun le dépôt et surtout la gestion des GTFS à télécharger et mettre à jour avec un CRON.

Ensuite, trouver un moyen de déployer plusieurs serveurs pour scaler, ou retester l'expérience PaaS ou Edge, mais on verra ça quand on aura du succès.

Pour lancer :

```
PORT=3001 pm2 start "yarn start"
```

Puis lancez la création de la DB par node-GTFS. Prend plusieurs minutes pour juste l'ouest de la France (config au moment où j'écris ces lignes).

```
localhost:3001/fetch
```

Regardez si ça marche

```
pm2 monit
```
