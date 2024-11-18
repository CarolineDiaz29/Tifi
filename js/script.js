import KEYS from "../assets/Keys.js";

const $d = document;
const $arepas = $d.getElementById("arepas");
const $template = $d.getElementById("arepa-template").content;
const $fragment = $d.createDocumentFragment();
const $carrito = $d.getElementById("carrito");
const $carritoItems = $d.querySelector(".carrito-items");
const $total = $d.querySelector(".carrito-precio-total");
const navCarrito = document.querySelector("i");
const carrito = document.getElementById('carrito');

const options = {
    headers: {
        "Authorization": `Bearer ${KEYS.secret}`,
        "Content-Type": "application/x-www-form-urlencoded"
    }
};

let products, prices;
let cartItems = JSON.parse(localStorage.getItem('cartItems')) || [];

navCarrito.addEventListener('mouseenter', () => {
    carrito.style.display = 'block';
    console.log("click");
});

carrito.addEventListener('mouseleave', () => {
    carrito.style.display = 'none';
});

// Save cart to localStorage
function saveCart() {
    localStorage.setItem('cartItems', JSON.stringify(cartItems));
}

// Get all products using pagination
async function getAllStripeData(endpoint) {
    let allData = [];
    let hasMore = true;
    let startingAfter = null;
   
    while (hasMore) {
        const url = startingAfter
            ? `https://api.stripe.com/v1/${endpoint}?limit=100&starting_after=${startingAfter}`
            : `https://api.stripe.com/v1/${endpoint}?limit=100`;
           
        const response = await fetch(url, options);
        const data = await response.json();
       
        allData = [...allData, ...data.data];
        hasMore = data.has_more;
       
        if (hasMore && data.data.length > 0) {
            startingAfter = data.data[data.data.length - 1].id;
        }
    }
   
    return allData;
}

// Update cart display
function updateCart() {
    $carritoItems.innerHTML = "";
    let total = 0;

    cartItems.forEach(item => {
        const itemElement = document.createElement("div");
        itemElement.className = "carrito-item";
        itemElement.innerHTML = `
            <img src="${item.image}" alt="${item.name}" class="carrito-item-img">
            <div class="carrito-item-detalles">
                <h3 class="carrito-item-titulo">${item.name}</h3>
                <div class="carrito-item-cantidad">
                    <button class="cantidad-btn-menos" data-id="${item.id}">-</button>
                    <span class="cantidad">${item.quantity}</span>
                    <button class="cantidad-btn-mas" data-id="${item.id}">+</button>
                </div>
                <p class="carrito-item-precio">$${(item.price).toLocaleString()}</p>
            </div>
            <button class="carrito-item-eliminar" data-id="${item.id}">🗑️</button>
        `;
       
        $carritoItems.appendChild(itemElement);
        total += item.price * item.quantity;
    });

    $total.textContent = `$${total.toLocaleString()}`;
    saveCart();
}

// Initialize products
Promise.all([
    getAllStripeData('products'),
    getAllStripeData('prices')
])
.then(([productsData, pricesData]) => {
    products = productsData;
    prices = pricesData;
   
    console.log(`Total products: ${products.length}`);
    console.log(`Total prices: ${prices.length}`);
   
    prices.forEach(el => {
        let productData = products.filter(product => product.id === el.product);
       
        if (productData.length > 0 && productData[0].active) {
            $template.querySelector(".arepa").setAttribute("data-price", el.id);
            $template.querySelector("img").src = productData[0].images[0];
            $template.querySelector("img").alt = productData[0].name;
           
            const price = (el.unit_amount_decimal / 100).toLocaleString();
            $template.querySelector("figcaption").innerHTML = `${productData[0].name}<br> $${price} ${el.currency.toUpperCase()}`;

            let $clone = $d.importNode($template, true);
            $fragment.appendChild($clone);
        }
    });

    $arepas.appendChild($fragment);
    updateCart();
})
.catch(error => {
    console.error('Error fetching data:', error);
    $arepas.innerHTML = `<p>Error al cargar los productos. Por favor, intente más tarde.</p>`;
});

// Event Listeners
$d.addEventListener("click", e => {
    // Add to cart
    if (e.target.classList.contains("arepa-btn")) {
        const $arepa = e.target.closest(".arepa");
        const priceId = $arepa.getAttribute("data-price");
        const priceData = prices.find(price => price.id === priceId);
        const productData = products.find(product => product.id === priceData.product);
       
        const cartItem = {
            id: priceId,
            name: productData.name,
            price: priceData.unit_amount / 100,
            image: productData.images[0],
            quantity: 1
        };

        const existingItem = cartItems.find(item => item.id === priceId);
        if (existingItem) {
            existingItem.quantity++;
        } else {
            cartItems.push(cartItem);
        }

        updateCart();
    }

    // Increase quantity
    if (e.target.classList.contains("cantidad-btn-mas")) {
        const id = e.target.getAttribute("data-id");
        const item = cartItems.find(item => item.id === id);
        if (item) {
            item.quantity++;
            updateCart();
        }
    }

    // Decrease quantity
    if (e.target.classList.contains("cantidad-btn-menos")) {
        const id = e.target.getAttribute("data-id");
        const item = cartItems.find(item => item.id === id);
        if (item && item.quantity > 1) {
            item.quantity--;
            updateCart();
        }
    }

    // Remove item
    if (e.target.classList.contains("carrito-item-eliminar")) {
        const id = e.target.getAttribute("data-id");
        cartItems = cartItems.filter(item => item.id !== id);
        updateCart();
    }
});

// Checkout button handler
$d.querySelector(".btn-pagar").addEventListener("click", async () => {
    if (cartItems.length > 0) {
        try {
            // Crear line items para Stripe checkout
            const lineItems = cartItems.map(item => ({
                price: item.id,
                quantity: item.quantity
            }));

            // Guardar el estado del carrito en sessionStorage antes de limpiarlo
            // (por si el usuario cancela el checkout)
            sessionStorage.setItem('pendingCart', JSON.stringify(cartItems));
           
            // Limpiar el carrito
            cartItems = [];
            localStorage.removeItem('cartItems');
            updateCart();

            // Redireccionar a Stripe checkout
            await Stripe(KEYS.public).redirectToCheckout({
                lineItems,
                mode: "payment",
                successUrl: "http://127.0.0.1:5500/assets/success.html",
                cancelUrl: "http://127.0.0.1:5500/assets/cancel.html"
            });
        } catch (error) {
            // Si hay un error, restaurar el carrito desde sessionStorage
            const pendingCart = sessionStorage.getItem('pendingCart');
            if (pendingCart) {
                cartItems = JSON.parse(pendingCart);
                updateCart();
            }
           
            console.error('Checkout error:', error);
            $arepas.insertAdjacentHTML("afterend", `<p class="error">${error.message}</p>`);
        }
    } else {
        alert("El carrito esta vacio!!!")
    }

   // Asegúrate que este código esté al inicio de tu archivo script.js
document.addEventListener('DOMContentLoaded', () => {
    // Obtener el ícono del carrito y el contenedor del carrito
    const carritoIcono = document.querySelector('.fa-cart-shopping');
    const carritoContenedor = document.getElementById('carrito');
   
    // Establecer display none inicialmente en el carrito
    carritoContenedor.style.display = 'none';

    // Variable para rastrear el estado del carrito
    let carritoVisible = false;
   
    // Función para alternar el carrito
    const toggleCarrito = (event) => {
        event.stopPropagation(); // Evitar que el click se propague
        carritoVisible = !carritoVisible; // Cambiar el estado
        carritoContenedor.style.display = carritoVisible ? 'block' : 'none';
    };
   
    // Agregar el evento click al ícono
    carritoIcono.addEventListener('click', toggleCarrito);
   
    // Para cerrar el carrito al hacer clic fuera de él
    document.addEventListener('click', () => {
        if (carritoVisible) {
            carritoVisible = false;
            carritoContenedor.style.display = none;
        }
    });

    // Detener la propagación de clics dentro del carrito
    carritoContenedor.addEventListener('click', (event) => {
        event.stopPropagation();
    });
});
});