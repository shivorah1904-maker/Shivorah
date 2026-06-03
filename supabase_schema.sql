-- SUPABASE SCHEMA SETUP FOR SHIVORAH ECOMMERCE

-- 1. Create Profiles Table (linked to Auth users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on Profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. Create Collections Table
CREATE TABLE IF NOT EXISTS public.collections (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    banner_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;

-- 3. Create Products Table
CREATE TABLE IF NOT EXISTS public.products (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    sku TEXT UNIQUE,
    description TEXT,
    short_description TEXT,
    price NUMERIC NOT NULL,
    compare_at_price NUMERIC,
    discount_percent NUMERIC,
    inventory_qty INTEGER DEFAULT 0,
    images TEXT[] DEFAULT '{}',
    video_url TEXT,
    category TEXT,
    collection_id UUID REFERENCES public.collections(id) ON DELETE SET NULL,
    tags TEXT[] DEFAULT '{}',
    is_featured BOOLEAN DEFAULT false,
    is_best_seller BOOLEAN DEFAULT false,
    status TEXT DEFAULT 'draft' CHECK (status IN ('active', 'draft', 'archived')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Index for slug search
CREATE INDEX IF NOT EXISTS products_slug_idx ON public.products(slug);

-- 4. Create Inventory History Table
CREATE TABLE IF NOT EXISTS public.inventory_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    change_qty INTEGER NOT NULL,
    reason TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.inventory_history ENABLE ROW LEVEL SECURITY;

-- 5. Create Homepage Settings Table
CREATE TABLE IF NOT EXISTS public.homepage_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.homepage_settings ENABLE ROW LEVEL SECURITY;

-- 6. Create Orders Table
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    customer_phone TEXT,
    customer_address TEXT NOT NULL,
    total_amount NUMERIC NOT NULL,
    order_status TEXT DEFAULT 'pending' CHECK (order_status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled')),
    payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'refunded')),
    items JSONB NOT NULL, -- Array of {product_id, name, qty, price, image}
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- 7. Create Newsletter Subscribers Table
CREATE TABLE IF NOT EXISTS public.subscribers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.subscribers ENABLE ROW LEVEL SECURITY;


-- ==========================================
-- TRIGGERS FOR PROFILE CREATION ON SIGNUP
-- ==========================================

-- Function to handle user profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    user_role TEXT := 'user';
BEGIN
    -- If there are no profiles in the database, promote the first user to admin automatically
    IF NOT EXISTS (SELECT 1 FROM public.profiles) THEN
        user_role := 'admin';
    END IF;
    
    INSERT INTO public.profiles (id, email, role)
    VALUES (new.id, new.email, user_role);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to run handle_new_user on auth.users insert
CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ==========================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================

-- A. Profiles Policies
CREATE POLICY "Public profiles are readable by everyone" 
    ON public.profiles FOR SELECT USING (true);

CREATE POLICY "Users can update their own profile" 
    ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- B. Collections Policies
CREATE POLICY "Collections are readable by everyone" 
    ON public.collections FOR SELECT USING (true);

CREATE POLICY "Admins have full write access to collections" 
    ON public.collections FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );

-- C. Products Policies
CREATE POLICY "Active products are readable by everyone" 
    ON public.products FOR SELECT USING (status = 'active' OR EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    ));

CREATE POLICY "Admins have full write access to products" 
    ON public.products FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );

-- D. Inventory History Policies
CREATE POLICY "Inventory history readable by admins" 
    ON public.inventory_history FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );

CREATE POLICY "Inventory history writeable by admins" 
    ON public.inventory_history FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );

-- E. Homepage Settings Policies
CREATE POLICY "Homepage settings are readable by everyone" 
    ON public.homepage_settings FOR SELECT USING (true);

CREATE POLICY "Admins have full write access to homepage settings" 
    ON public.homepage_settings FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );

-- F. Orders Policies
CREATE POLICY "Anyone can create orders" 
    ON public.orders FOR INSERT WITH CHECK (true);

CREATE POLICY "Orders are readable by admins" 
    ON public.orders FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );

CREATE POLICY "Orders are updateable by admins" 
    ON public.orders FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );

-- G. Subscribers Policies
CREATE POLICY "Anyone can subscribe to newsletter" 
    ON public.subscribers FOR INSERT WITH CHECK (true);

CREATE POLICY "Subscribers are readable by admins" 
    ON public.subscribers FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );


-- ==========================================
-- STORAGE BUCKETS SETUP (Run in SQL editor or admin dashboard API)
-- ==========================================

-- Note: In Supabase, bucket creation can be done through SQL commands:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('media', 'media', true) ON CONFLICT DO NOTHING;
-- Policies for storage.objects:
-- SELECT enabled for everyone
-- ALL enabled for admins

-- CREATE Storage policies programmatically if tables exist:
DO $$
BEGIN
    INSERT INTO storage.buckets (id, name, public) 
    VALUES ('media', 'media', true) 
    ON CONFLICT (id) DO NOTHING;
EXCEPTION
    WHEN OTHERS THEN
        -- Handle cases where storage tables might not be fully initialized or permission denied
        NULL;
END $$;

-- Enable policies for the 'media' bucket
-- SELECT policy
CREATE POLICY "Media is publicly accessible" 
    ON storage.objects FOR SELECT USING (bucket_id = 'media');

-- Admin write policies
CREATE POLICY "Admins can upload media" 
    ON storage.objects FOR INSERT WITH CHECK (
        bucket_id = 'media' AND 
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );

CREATE POLICY "Admins can update media" 
    ON storage.objects FOR UPDATE USING (
        bucket_id = 'media' AND 
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );

CREATE POLICY "Admins can delete media" 
    ON storage.objects FOR DELETE USING (
        bucket_id = 'media' AND 
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
        )
    );
