# Social Monochrome : exploration visuelle

Propositions uniquement. Aucun écran de production modifié, aucune direction approuvée. Les personnes, présences et messages des maquettes sont illustratifs. Les images montrent une intention graphique, pas des captures d’une implémentation.

## Le travail de cette partie de l’application

Voir ce que les autres écoutent, découvrir leurs partages, lancer un morceau et poursuivre une conversation. Garder les abonnements, les amitiés mutuelles, les groupes, les extraits, les images, les blocages et les règles de confidentialité existants. Pas de nouvelle promesse d’écoute synchronisée : écouter une présence reprend le comportement actuel du lecteur.

## Résonance

Ma préférence pour retrouver la présence visuelle de Listening Stats tout en donnant au social une composition propre. Les pochettes portent les personnes : trois écoutes sont disposées en profondeur et chaque nom reste lisible. Une écoute sélectionnée donne accès au morceau, au profil et à la conversation. Pas de compteur géant ni de graphique repris des statistiques.

- Base : noir #0a0a0c, texte #f1f0f3, secondaire #9b99a3 ; prune #6e668c et cuivre #aa775d illustrent les couleurs extraites des pochettes, sans devenir des couleurs fixes de statut.
- Typographie : Switzer pour les titres et les morceaux mis en avant ; Inter pour les échanges et les commandes, comme dans l’application.
- Fil : une scène de présence en ouverture, puis des publications lisibles. Les commentaires se déplient sous leur publication sans ouvrir une nouvelle page. Les publications purement textuelles restent de vrais contenus, sans pochette factice.
- Messages : la scène se replie dans une bande de présence. Liste de conversations, fil et saisie restent dans des positions stables. Les extraits se présentent comme un objet musical que l’on peut ouvrir, lire et réduire ; lecture par le lecteur global.
- Profil : en-tête composé de l’avatar, de l’identité et de l’écoute actuelle ou récente, puis les publications. Les collections et statistiques ne deviennent visibles que si les fonctions et autorisations existantes le permettent.
- Partage : même vocabulaire visuel pour choisir un morceau et un extrait ; retour clair dans le fil ou la conversation sélectionnée.

Moment signature : sélectionner une personne avance sa pochette dans la scène, déplace les voisines et remplace le détail sans saut de mise en page. L’ambiance suit les couleurs de la nouvelle pochette. L’ouverture de Messages replie cette même scène en bande compacte.

Risque : trop de proximité avec les statistiques. La priorité donnée aux personnes, aux titres et aux échanges doit différencier la composition. Pas d’orbite décorative, pas de particules et pas d’animation permanente de toutes les pochettes.

## Chambre noire

Une direction plus structurée, inspirée de la sélection sur planche-contact. Une grande écoute sélectionnée et quatre écoutes voisines forment une grille asymétrique. Chaque image porte immédiatement son auteur et son titre. L’ensemble fonctionne aussi avec peu de membres et des contenus calmes.

- Base : graphite #101113, texte #eeeeef, secondaire #999da5 ; ardoise #586d91 et argile #ae7867 comme exemples d’ambiance issue des contenus.
- Typographie : Switzer et Inter ; les noms et les titres participent à l’alignement de la grille.
- Fil : les pochettes composent l’ouverture ; les publications suivent avec une largeur de lecture confortable.
- Messages : une liste compacte de contacts et une conversation principale ; l’extrait partagé s’agrandit dans le fil comme une image choisie sur une planche.
- Profil : les derniers partages composent la planche du membre, avec une alternative chronologique lisible pour les publications textuelles.
- Partage : l’objet choisi prend place dans un aperçu avant publication.

Moment signature : une écoute sélectionnée change de format dans la grille, les autres conservent leur identité et se déplacent ensemble. Pas de perforations de film, de numéros décoratifs ni d’appareil photo dessiné.

Risque : la collection d’images pourrait prendre le pas sur les échanges. Les noms, les messages et les actions doivent rester visibles sans survol.

## Social classique

Point de comparaison familier : fil au centre, présences et conversations à droite, composition sans grande scène. Très efficace pour discuter, moins singulier. Présenté comme alternative, pas comme recommandation.

## Mouvement et états à prévoir dans la refonte

Une transition majeure par action : sélection 360–420 ms, changement de vue 280–360 ms, retours de commandes 120–180 ms. Mouvements interrompables ; les mises à jour de présence ne rejouent pas l’entrée. Pas d’effet de souris sur le texte ou les champs de saisie. Au clavier, les mêmes actions restent accessibles et le focus ne se perd pas pendant les transitions.

Les couleurs servent l’ambiance, jamais seules la disponibilité ou la lecture d’un message. Textes et contrôles conservent le contraste du thème. En mode de mouvement réduit, les changements restent immédiats et complets. Sans extraction de couleur, la composition fonctionne en neutre.

Prévoir les variantes sans membre en écoute, sans ami, sans publication, conversation vide, contenu supprimé, chargement, perte de connexion et erreur avec nouvelle tentative. Un membre hors ligne reste identifiable, sans faux indicateur animé. Une bibliothèque sans pochette utilise un visuel neutre existant.

Desktop prioritaire. Sur téléphone, les écoutes deviennent une sélection horizontale et Messages conserve le parcours liste puis conversation, avec retour explicite. Le lecteur global et la saisie ne se recouvrent pas.

## Comparaison des structures explorées

Liste de travail : 1 Résonance (scène), 2 Échange de mixtapes (objets), 3 Chambre noire (planches-contact), 4 Fréquences (radio), 5 Affiches de club (programmation), 6 Notes de pochette (annotation), 7 Partition commune (notation). Seed 32ab26f6, candidat 3.

Les challengers de données, d’édition, de tableau de départs, de grille typographique, de carte et de catalogue ont été écartés sur deux critères : identification d’un petit cercle d’amis et clarté du parcours social. Leurs disciplines retenues figurent dans le comparatif ; leurs langages graphiques ne sont pas mélangés aux propositions.
