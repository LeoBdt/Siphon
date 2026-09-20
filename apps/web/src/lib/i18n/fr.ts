import type { Dictionary } from "./en";

/**
 * Typed as `Dictionary`, so adding a key to `en.ts` without translating it here
 * fails the typecheck — the interface can never fall back to a raw key.
 */
export const fr: Dictionary = {
  locale: {
    label: "Langue",
    en: "English",
    fr: "Français",
    dizzy: "Franglais",
  },

  auth: {
    signInTitle: "Connexion",
    signInSubtitle: "Cette instance est privée.",
    setupTitle: "Bienvenue sur Siphon",
    setupSubtitle:
      "Crée le compte administrateur. Il n'y a pas de mot de passe par défaut — tu le choisis maintenant.",
    inviteTitle: "Rejoindre cette instance",
    inviteSubtitle: (group: string) => `Tu es invité en tant que ${group}.`,
    inviteInvalid: "Cette invitation a expiré ou a déjà été utilisée.",
    username: "Identifiant",
    code: "Code d'authentification",
    codeHint: "Les six chiffres de ton application d'authentification.",
    password: "Mot de passe",
    passwordHint: (min: number) => `Au moins ${min} caractères.`,
    submitSignIn: "Se connecter",
    submitSetup: "Créer le compte",
    submitInvite: "Créer mon compte",
    signOut: "Se déconnecter",
    checking: "Vérification…",
    privacyRevoked:
      "Ton dossier n'est plus privé : un administrateur a retiré la permission.",
  },

  nav: {
    download: "Télécharger",
    files: "Fichiers",
    history: "Historique",
    settings: "Réglages",
    home: "Siphon — accueil",
  },

  common: {
    cancel: "Annuler",
    retry: "Relancer",
    delete: "Supprimer",
    close: "Fermer",
    save: "Enregistrer",
    loading: "Chargement…",
    empty: "Rien ici pour l'instant",
    unknown: "Inconnu",
    error: "Une erreur est survenue",
  },

  download: {
    title: "Télécharger une vidéo",
    subtitle:
      "Colle une URL — vidéo, playlist ou chaîne — et choisis une qualité.",
    cardTitle: "Nouvelle tâche",
    cardDescription:
      "Le téléchargement arrivera dans le dossier sélectionné ci-dessous.",
    urlPlaceholder: "https://www.youtube.com/watch?v=…",
    analyzing: "Analyse de l'URL…",
    probeFailed: "Impossible de lire cette URL. Vérifie le lien.",
    playlistBadge: (n: number) => `Playlist · ${n} vidéo${n > 1 ? "s" : ""}`,
    quality: "Qualité",
    destination: "Destination",
    root: "Racine",
    submit: "Télécharger",
    retention: "Destination",
    retentionLibrary: "Bibliothèque",
    retentionDirect: "Direct",
    retentionLibraryHint: "Conservé sur le serveur, visible dans Fichiers.",
    retentionDirectHint:
      "Envoyé à ton navigateur, puis supprimé du serveur. À récupérer sous un jour.",
    save: "Enregistrer le fichier",
    submitMany: (n: number) => `Télécharger (${n})`,
    started: "Téléchargement lancé",
    startedMany: (n: number) => `${n} téléchargements lancés`,
    active: (n: number) => `En cours (${n})`,
    done: "Terminé",
  },

  quality: {
    modeVideo: "Vidéo",
    modeAudio: "Audio seul",
    videoNote: "Son inclus, toujours à la meilleure qualité disponible",
    advanced: "Options avancées",
    maxResolution: "Résolution max",
    fps: "Images par seconde",
    auto: "Auto",
    autoMax: "Auto (max)",

    presets: {
      best: {
        label: "Meilleure qualité",
        description: "Vidéo et audio, la meilleure disponible",
      },
      "2160p": { label: "4K · 2160p", description: "Ultra HD (3840×2160) max" },
      "1440p": { label: "1440p", description: "Quad HD (2560×1440) max" },
      "1080p60": {
        label: "1080p · 60 fps",
        description: "Full HD, fluide à 60 images par seconde",
      },
      "1080p": { label: "1080p", description: "Full HD (1920×1080) max" },
      "720p": { label: "720p", description: "HD (1280×720) max" },
      "480p": { label: "480p", description: "SD (854×480) max" },
      "audio-mp3": {
        label: "MP3",
        description:
          "Réencodé en MP3 — lisible partout, légère perte de qualité",
      },
      "audio-m4a": {
        label: "M4A (original)",
        description:
          "La piste AAC d'origine, extraite telle quelle — aucun réencodage, aucune perte",
      },
      "audio-opus": {
        label: "Opus (original)",
        description:
          "La piste Opus d'origine — meilleur rapport qualité/taille, moins compatible",
      },
    },
  },

  job: {
    queued: "En file d'attente",
    analyzing: "Analyse",
    downloadingVideo: "Téléchargement · vidéo",
    downloadingAudio: "Téléchargement · audio",
    merging: "Fusion vidéo + audio",
    converting: "Conversion",
    completed: "Terminé",
    failed: "Échec",
    canceled: "Annulé",
    videos: (n: number) => `${n} vidéo${n > 1 ? "s" : ""}`,
    steps: {
      download: "Téléchargement",
      process: "Traitement",
      done: "Terminé",
    },
    actions: {
      cancel: "Annuler",
      retry: "Réessayer",
      remove: "Supprimer de l'historique",
    },
    eta: "Reste",
  },

  player: {
    volume: "Volume",
    volumeAt: (pct: number) => `Volume ${pct} %`,
    mute: "Couper le son",
    unmute: "Réactiver le son",
    fullscreen: "Plein écran",
    video: "Vidéo",
  },

  playlist: {
    selected: (n: number, total: number) => `${n} sur ${total} sélectionnées`,
    selectAll: "Tout cocher",
    clearAll: "Tout décocher",
  },

  rick: {
    button: "Never gonna let you down",
    badge: "Un classique",
    toast: "Never gonna give you up",
  },

  toast: {
    jobDone: (title: string) => `Terminé : ${title}`,
    jobFailed: (title: string) => `Échec : ${title}`,
  },

  settings: {
    title: "Réglages",
    subtitle: "Téléchargements, stockage et maintenance de yt-dlp.",

    sections: {
      general: "Général",
      downloads: "Téléchargements",
      storage: "Stockage",
      engine: "Moteur",
      accounts: "Comptes",
    },

    concurrency: {
      title: "Téléchargements simultanés",
      description:
        "Nombre de vidéos téléchargées en même temps. Trop élevé peut saturer la bande passante ou se faire limiter par la plateforme.",
      saved: (n: number) =>
        n > 1 ? `${n} téléchargements en parallèle` : "Un téléchargement à la fois",
    },

    disk: {
      title: "Espace disque",
      description: "Le volume qui héberge ta bibliothèque.",
      reading: "Lecture…",
      unavailable: "Espace disque indisponible.",
      used: (used: string, pct: number) => `${used} utilisés · ${pct} %`,
      free: (free: string, total: string) => `${free} libres sur ${total}`,
    },

    cleanup: {
      title: "Fichiers temporaires",
      description:
        "Un téléchargement interrompu laisse des restes : fragments .part et pistes vidéo/audio jamais fusionnées, qui peuvent peser plusieurs gigaoctets. Le nettoyage est refusé tant qu'un téléchargement tourne.",
      action: "Nettoyer maintenant",
      nothing: "Rien à nettoyer",
      done: (n: number, freed: string) =>
        `${n} fichier${n > 1 ? "s" : ""} supprimé${n > 1 ? "s" : ""} · ${freed} libérés`,
    },

    ytdlp: {
      title: "yt-dlp",
      description:
        "Le moteur de téléchargement. À mettre à jour régulièrement — YouTube change souvent et casse les anciennes versions.",
      installed: "Version installée",
      action: "Vérifier les mises à jour",
      checked: "yt-dlp vérifié",
      failed: "Mise à jour de yt-dlp échouée",
      lastChecked: (when: string) => `Dernier contrôle ${when}`,
      neverChecked: "Jamais vérifié",
      auto: "Vérifier automatiquement",
      autoHint:
        "Au démarrage, puis une fois par jour. La mise à jour s'applique aussitôt.",
      on: "Activé",
      off: "Désactivé",
    },

    accounts: {
      title: "Comptes",
      members: "Membres",
      membersHint: "Les personnes ayant accès à cette instance.",
      groups: "Groupes",
      groupsHint:
        "Un groupe définit les valeurs par défaut. Ce qui est réglé sur un membre les remplace.",
      invite: "Inviter quelqu'un",
      inviteHint:
        "Le lien reprend l'adresse que tu utilises en ce moment — ouvre Siphon sur l'adresse que tu veux partager avant d'en créer un.",
      inviteCopied: "Lien d'invitation copié",
      inviteExpires: (when: string) => `Expire le ${when}`,
      revoke: "Révoquer",
      you: "toi",
      lastSeen: (when: string) => `Vu le ${when}`,
      neverSignedIn: "Jamais connecté",
      newGroup: "Nouveau groupe",
      groupName: "Nom du groupe",
      inherited: "Du groupe",
      deleteMember: "Retirer ce membre",
      suspend: "Suspendre",
      lockedBySystem: (when: string) =>
        `Verrouillé par le système jusqu'à ${when} — trop d'échecs de connexion`,
      unlock: "Déverrouiller",
      unsuspend: "Rétablir l'accès",
      suspended: "Suspendu",
      deleteTitle: (name: string) => `Supprimer ${name} ?`,
      deleteWarning:
        "Le compte et tout le contenu de son dossier seront supprimés. Les téléchargements déjà dans la bibliothèque commune ne sont pas touchés. C'est irréversible.",
      deleteConfirm: (name: string) => `Saisis ${name} pour confirmer`,
      deleteAction: "Supprimer définitivement",
      deleted: "Compte supprimé",
      permissions: {
        canDownload: "Télécharger",
        canKeepInLibrary: "Conserver les fichiers dans la bibliothèque",
        canManageFiles: "Renommer, déplacer et supprimer des fichiers",
        canManageSettings: "Modifier les réglages de l'application",
        canHavePrivateFolder: "Peut avoir un dossier privé",
        canBrowseWholeLibrary: "Voir toute la bibliothèque",
        isAdmin: "Administrateur",
      },
    },

    privacy: {
      title: "Dossier privé",
      description:
        "Masque ton dossier aux autres membres dans cette interface. C'est de la discrétion, pas du secret : qui administre le serveur atteint toujours les fichiers sur le disque.",
      unavailable: "Un administrateur n'a pas accordé cette permission.",
    },

    security: {
      title: "Second facteur",
      description:
        "Demander un code à six chiffres d'une application d'authentification à la connexion.",
      enabled: "Activé",
      start: "Configurer",
      secretHint:
        "Ajoute ce secret à ton application d'authentification, puis saisis le code affiché pour confirmer.",
      confirm: "Confirmer",
      disable: "Désactiver",
      disableHint: "Saisis ton mot de passe pour désactiver.",
      turnedOn: "Second facteur activé",
      turnedOff: "Second facteur désactivé",
    },

    audit: {
      title: "Activité",
      description: "Connexions et modifications apportées à cette instance.",
      empty: "Rien d'enregistré pour l'instant.",
      actions: {
        "login.success": "Connexion",
        "login.failed": "Échec de connexion",
        "login.locked": "Compte verrouillé",
        logout: "Déconnexion",
        "user.created": "Membre ajouté",
        "user.updated": "Membre modifié",
        "user.deleted": "Membre retiré",
        "group.created": "Groupe créé",
        "group.updated": "Groupe modifié",
        "group.deleted": "Groupe supprimé",
        "invite.created": "Invitation créée",
        "invite.revoked": "Invitation révoquée",
        "privacy.revoked": "Dossier privé révoqué",
        "totp.enabled": "Second facteur activé",
        "totp.disabled": "Second facteur désactivé",
        "password.changed": "Mot de passe modifié",
      },
    },

    language: {
      title: "Langue",
      description: "S'applique à toute l'interface.",
    },

    theme: {
      title: "Apparence",
      description: "« Système » suit le réglage de ton système d'exploitation.",
      light: "Clair",
      dark: "Sombre",
      system: "Système",
    },
  },

  history: {
    title: "Historique",
    subtitle: "Tous tes téléchargements, avec relance et suppression.",
    search: "Rechercher…",
    empty: "Aucun téléchargement pour l'instant",
    noResults: "Aucun résultat.",
    filters: {
      all: "Tous",
      downloading: "En cours",
      completed: "Terminés",
      error: "Échecs",
      canceled: "Annulés",
    },
  },

  files: {
    title: "Fichiers",
    empty: "Ce dossier est vide",
    newFolder: "Nouveau dossier",
    folderName: "Nom du dossier",
    create: "Créer",
    rename: "Renommer",
    download: "Télécharger",
    downloadZip: "Télécharger le dossier (zip)",
    downloadEntry: (isDir: boolean) =>
      isDir ? "Télécharger (zip)" : "Télécharger",
    play: "Lire",
    open: "Ouvrir",
    refresh: "Rafraîchir",
    emptyHint:
      "Dossier vide — clic droit pour en créer un, ou glisse des fichiers ici.",
    root: "Racine",
    moved: (target: string) => `Déplacé dans ${target}`,
    movedMany: (n: number, target: string) =>
      `${n} élément${n > 1 ? "s" : ""} déplacé${n > 1 ? "s" : ""} dans ${target}`,
    renamed: "Renommé",
    renameTitle: "Renommer",
    deleted: "Supprimé",
    deletedMany: (n: number) =>
      `${n} élément${n > 1 ? "s" : ""} supprimé${n > 1 ? "s" : ""}`,
    folderCreated: "Dossier créé",

    disguiseHint: (ext: string) =>
      `Un dossier déguisé en ${ext}. Il s'ouvrira quand même comme un dossier.`,
    disguiseTooltip: "Un dossier déguisé",

    selected: (n: number) => `${n} sélectionné${n > 1 ? "s" : ""}`,
    selectAll: "Tout sélectionner",
    clearSelection: "Désélectionner",
    downloadSelected: "Télécharger la sélection",
    deleteSelected: "Supprimer la sélection",
    downloadingHere: "Téléchargement",
  },

  apiErrors: {
    accountLockedUntil: (when: string) =>
      `Trop de tentatives échouées. Ce compte est verrouillé jusqu'à ${when}.`,
    account_suspended:
      "Ce compte a été suspendu par un administrateur.",
    csrf_failed:
      "Cette requête n'a pas pu être vérifiée. Recharge la page et réessaie.",
    account_locked:
      "Trop de tentatives échouées. Ce compte est verrouillé quelques minutes.",
    totp_required: "Saisis le code de ton application d'authentification.",
    totp_invalid: "Ce code d'authentification n'est pas le bon.",
    unauthenticated: "Connecte-toi pour continuer.",
    forbidden: "Tu n'as pas la permission de faire ça.",
    invalid_credentials: "Identifiant ou mot de passe incorrect.",
    weak_password: "Ce mot de passe est trop court.",
    too_many_attempts: "Trop de tentatives. Réessaie dans quelques minutes.",
    already_setup: "Cette instance est déjà configurée.",
    last_admin: "C'est le seul administrateur.",
    self_delete: "Tu ne peux pas supprimer ton propre compte.",
    group_in_use:
      "Les groupes intégrés, et ceux qui ont des membres, ne peuvent pas être supprimés.",
    invalid_name: "Un nom est requis.",
    downloads_active:
      "Des téléchargements sont en cours — réessaie une fois terminés.",
    concurrency_out_of_range: "Cette valeur est hors de la plage autorisée.",
    already_exists: "Un fichier ou dossier porte déjà ce nom.",
    invalid_path: "Cet emplacement n'est pas autorisé.",
    not_found: "Introuvable.",
  },

  errors: {
    private_video: "Cette vidéo est privée.",
    members_only: "Cette vidéo est réservée aux membres de la chaîne.",
    unavailable: "Cette vidéo a été supprimée ou est indisponible.",
    age_restricted:
      "Cette vidéo est limitée par l'âge et nécessite une connexion.",
    geo_blocked: "Cette vidéo n'est pas disponible dans ton pays.",
    bot_check:
      "La plateforme demande une vérification humaine. Réessaie plus tard.",
    no_format: "Aucun format ne correspond à la qualité demandée.",
    network: "Erreur réseau en contactant la plateforme.",
    ffmpeg_missing:
      "ffmpeg est introuvable — il est nécessaire pour fusionner les pistes.",
    unknown: "Le téléchargement a échoué.",
  },
};
