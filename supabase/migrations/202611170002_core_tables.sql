CREATE TABLE public.countries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code char(2) NOT NULL UNIQUE CHECK (code ~ '^[A-Z]{2}$'),
  name text NOT NULL UNIQUE CHECK (length(trim(name)) BETWEEN 2 AND 100),
  currency_code char(3) NOT NULL DEFAULT 'KES' CHECK (currency_code ~ '^[A-Z]{3}$'),
  timezone text NOT NULL DEFAULT 'Africa/Nairobi' CHECK (length(trim(timezone)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.counties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id uuid NOT NULL REFERENCES public.countries(id) ON DELETE CASCADE,
  code char(3) NOT NULL CHECK (code ~ '^[0-9]{3}$'),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (country_id, code),
  UNIQUE (country_id, name)
);

CREATE TABLE public.towns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  county_id uuid NOT NULL REFERENCES public.counties(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (county_id, name)
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text,
  display_name text CHECK (display_name IS NULL OR length(trim(display_name)) <= 80),
  avatar_path text,
  bio text CHECK (bio IS NULL OR length(bio) <= 500),
  country_code char(2) NOT NULL DEFAULT 'KE' REFERENCES public.countries(code) ON UPDATE CASCADE ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (username IS NULL OR username ~ '^[A-Za-z0-9_]{3,30}$')
);

CREATE UNIQUE INDEX profiles_username_lower_uidx
  ON public.profiles (lower(username))
  WHERE username IS NOT NULL;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin', 'moderator')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE INDEX user_roles_user_id_idx ON public.user_roles (user_id);

CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (length(trim(name)) BETWEEN 2 AND 80),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text CHECK (description IS NULL OR length(description) <= 300),
  icon text CHECK (icon IS NULL OR length(icon) <= 50),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
  country_code char(2) NOT NULL DEFAULT 'KE' REFERENCES public.countries(code) ON UPDATE CASCADE ON DELETE RESTRICT,
  county_id uuid NOT NULL REFERENCES public.counties(id) ON DELETE RESTRICT,
  town_id uuid NOT NULL REFERENCES public.towns(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 3 AND 140),
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 10 AND 5000),
  location extensions.geography(Point, 4326) NOT NULL,
  price_min numeric(12, 2) CHECK (price_min IS NULL OR price_min >= 0),
  price_max numeric(12, 2) CHECK (price_max IS NULL OR price_max >= 0),
  currency_code char(3) NOT NULL DEFAULT 'KES' CHECK (currency_code ~ '^[A-Z]{3}$'),
  visiting_hours jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(visiting_hours) = 'object'),
  cover_photo_path text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason text CHECK (rejection_reason IS NULL OR length(rejection_reason) <= 1000),
  avg_rating numeric(3, 2) NOT NULL DEFAULT 0 CHECK (avg_rating BETWEEN 0 AND 5),
  rating_count integer NOT NULL DEFAULT 0 CHECK (rating_count >= 0),
  like_count integer NOT NULL DEFAULT 0 CHECK (like_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (price_min IS NULL OR price_max IS NULL OR price_max >= price_min),
  CHECK (status = 'rejected' OR rejection_reason IS NULL),
  CHECK (extensions.st_x(location::extensions.geometry) BETWEEN -180 AND 180),
  CHECK (extensions.st_y(location::extensions.geometry) BETWEEN -90 AND 90)
);

CREATE INDEX places_author_id_idx ON public.places (author_id);
CREATE INDEX places_category_id_idx ON public.places (category_id);
CREATE INDEX places_country_county_town_idx ON public.places (country_code, county_id, town_id);
CREATE INDEX places_status_created_at_idx ON public.places (status, created_at DESC);
CREATE INDEX places_location_gist_idx ON public.places USING gist (location);

CREATE TABLE public.place_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id uuid NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE CHECK (length(trim(storage_path)) > 0),
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  is_cover boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX place_photos_place_order_idx ON public.place_photos (place_id, sort_order);
CREATE UNIQUE INDEX place_photos_one_cover_per_place_uidx
  ON public.place_photos (place_id)
  WHERE is_cover;
